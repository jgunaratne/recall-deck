import { getAnthropicClient, MODELS } from '@/lib/anthropic';
import { getGeminiClient, GEMINI_MODELS, withGeminiFallback } from '@/lib/gemini';
import { getChatSystemPrompt, READING_LEVELS, type ReadingLevel } from '@/lib/prompts';
import { resolveProvider, getFallbackProvider, shouldFallback, type AIProvider } from '@/lib/provider';

export const runtime = 'nodejs';

// Map provider SDK errors to a user-presentable message and HTTP status,
// without leaking raw provider payloads to the client.
function describeChatError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  let code = (error as { status?: number } | null)?.status;
  if (typeof code !== 'number') {
    // Gemini errors embed the upstream JSON body in the message.
    const match = raw.match(/"code"\s*:\s*(\d{3})/);
    if (match) code = parseInt(match[1], 10);
  }

  if (code === 503 || code === 529) {
    return {
      status: 503,
      message:
        'The AI model is experiencing high demand right now. This is usually temporary — try again in a moment.',
    };
  }
  if (code === 429) {
    return {
      status: 429,
      message: 'Rate limit reached. Wait a few seconds and try again.',
    };
  }
  if (code === 401 || code === 403) {
    return {
      status: code,
      message: 'The AI provider rejected the API key — check the server configuration.',
    };
  }
  return {
    status: 500,
    message: 'Something went wrong while generating a response. Please try again.',
  };
}

/**
 * Create a readable SSE stream for the given provider.
 * Throws on connection-level errors (e.g. rate limit) so the caller can
 * catch and fall back to another provider.
 */
async function createStream(
  provider: AIProvider,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
): Promise<ReadableStream> {
  const encoder = new TextEncoder();

  if (provider === 'gemini') {
    const ai = getGeminiClient();
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await withGeminiFallback(GEMINI_MODELS.CHAT, (model) =>
      ai.models.generateContentStream({
        model,
        contents,
        config: { systemInstruction: systemPrompt },
      }),
    );

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const text = chunk.text;
            if (text) {
              const data = JSON.stringify({ type: 'text', text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Chat stream error:', error instanceof Error ? error.message : error);
          const data = JSON.stringify({ type: 'error', error: describeChatError(error).message });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          controller.close();
        }
      },
    });
  } else {
    // Anthropic
    const client = getAnthropicClient();
    const stream = await client.messages.stream({
      model: MODELS.CHAT,
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const data = JSON.stringify({ type: 'text', text: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Chat stream error:', error instanceof Error ? error.message : error);
          const data = JSON.stringify({ type: 'error', error: describeChatError(error).message });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          controller.close();
        }
      },
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages;
    const provider = resolveProvider(body);
    const readingLevel: ReadingLevel = READING_LEVELS.includes(body.readingLevel)
      ? body.readingLevel
      : 'high';
    const systemPrompt = getChatSystemPrompt(readingLevel);

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content || typeof msg.content !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid message format' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        return new Response(JSON.stringify({ error: 'Invalid message role' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    let readable: ReadableStream;
    // The provider that actually serves the response — differs from the
    // requested one only when the retryable-error fallback kicks in.
    let servedBy = provider;
    try {
      readable = await createStream(provider, messages, systemPrompt);
    } catch (error) {
      // If the primary provider fails with a retryable error, try the fallback
      const fallback = getFallbackProvider(provider);
      if (fallback && shouldFallback(error)) {
        console.warn(
          `Primary provider "${provider}" failed (${error instanceof Error ? error.message : error}), falling back to "${fallback}"`,
        );
        readable = await createStream(fallback, messages, systemPrompt);
        servedBy = fallback;
      } else {
        throw error;
      }
    }

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
        'X-Provider': servedBy,
      },
    });
  } catch (error) {
    console.error('Chat API error:', error instanceof Error ? error.message : 'Unknown error');
    const { status, message } = describeChatError(error);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
