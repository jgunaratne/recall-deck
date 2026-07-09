import { getAnthropicClient, MODELS } from '@/lib/anthropic';
import { getGeminiClient, GEMINI_MODELS } from '@/lib/gemini';
import { MONTY_SYSTEM_PROMPT, getMontyReactUserPrompt } from '@/lib/prompts';
import { resolveProvider } from '@/lib/provider';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { question, chosen, correct, was_correct, streak, response_time_s } = body;
    const provider = resolveProvider(body);

    // Validate required fields
    if (!question || !chosen || !correct || typeof was_correct !== 'boolean' || typeof streak !== 'number') {
      return new Response(JSON.stringify({ error: 'Invalid reaction payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!chosen.text || !chosen.why_tempting || !correct.text || !correct.why_tempting) {
      return new Response(JSON.stringify({ error: 'Missing answer details' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();
    let readable: ReadableStream;

    if (provider === 'gemini') {
      const ai = getGeminiClient();

      const responseStream = await ai.models.generateContentStream({
        model: GEMINI_MODELS.QUIZ_REACT,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: getMontyReactUserPrompt({
                  question,
                  chosen: { text: chosen.text, why_tempting: chosen.why_tempting },
                  correct: { text: correct.text, why_tempting: correct.why_tempting },
                  was_correct,
                  streak,
                  response_time_s: typeof response_time_s === 'number' ? response_time_s : 0,
                }),
              },
            ],
          },
        ],
        config: {
          systemInstruction: MONTY_SYSTEM_PROMPT,
        },
      });

      readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of responseStream) {
              const text = chunk.text;
              if (text) {
                const data = JSON.stringify({ type: 'text', text });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Stream error';
            const data = JSON.stringify({ type: 'error', error: errorMessage });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            controller.close();
          }
        },
      });
    } else {
      // Anthropic
      const client = getAnthropicClient();

      const stream = await client.messages.stream({
        model: MODELS.QUIZ_REACT,
        max_tokens: 256,
        system: MONTY_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: getMontyReactUserPrompt({
              question,
              chosen: { text: chosen.text, why_tempting: chosen.why_tempting },
              correct: { text: correct.text, why_tempting: correct.why_tempting },
              was_correct,
              streak,
              response_time_s: typeof response_time_s === 'number' ? response_time_s : 0,
            }),
          },
        ],
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
            const errorMessage = error instanceof Error ? error.message : 'Stream error';
            const data = JSON.stringify({ type: 'error', error: errorMessage });
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
    console.error('Quiz react error:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(JSON.stringify({ error: 'Failed to generate reaction' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
