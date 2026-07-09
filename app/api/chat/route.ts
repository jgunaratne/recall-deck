import { getAnthropicClient, MODELS } from '@/lib/anthropic';
import { getGeminiClient, GEMINI_MODELS } from '@/lib/gemini';
import { getChatSystemPrompt, READING_LEVELS, type ReadingLevel } from '@/lib/prompts';
import { resolveProvider } from '@/lib/provider';

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

    const encoder = new TextEncoder();

    let readable: ReadableStream;

    if (provider === 'gemini') {
      const ai = getGeminiClient();

      // Convert messages to Gemini contents format (Gemini uses 'model' instead of 'assistant')
      const contents = messages.map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const response = await ai.models.generateContentStream({
        model: GEMINI_MODELS.CHAT,
        contents,
        config: {
          systemInstruction: systemPrompt,
        },
      });

      readable = new ReadableStream({
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
      // Anthropic (default)
      const client = getAnthropicClient();

      const stream = await client.messages.stream({
        model: MODELS.CHAT,
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      readable = new ReadableStream({
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

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
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
