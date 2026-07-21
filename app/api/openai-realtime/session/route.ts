import { buildLiveSystemInstruction } from '@/lib/gemini-live-prompts';
import { getOpenAIClient, OPENAI_MODELS, OPENAI_REALTIME_VOICE } from '@/lib/openai';
import { READING_LEVELS, type ReadingLevel } from '@/lib/prompts';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { topic } = body;

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return Response.json(
        { error: 'A non-empty topic string is required' },
        { status: 400 },
      );
    }

    const readingLevel: ReadingLevel = READING_LEVELS.includes(body.readingLevel)
      ? body.readingLevel
      : 'high';

    const client = getOpenAIClient();
    const systemInstruction = buildLiveSystemInstruction(topic.trim(), readingLevel);

    const secret = await client.realtime.clientSecrets.create({
      expires_after: {
        anchor: 'created_at',
        seconds: 600,
      },
      session: {
        type: 'realtime',
        model: OPENAI_MODELS.REALTIME,
        instructions: systemInstruction,
        output_modalities: ['audio'],
        audio: {
          input: {
            format: {
              type: 'audio/pcm',
              rate: 24000,
            },
            noise_reduction: { type: 'near_field' },
            transcription: {
              model: 'gpt-4o-mini-transcribe',
            },
            turn_detection: null,
          },
          output: {
            voice: OPENAI_REALTIME_VOICE,
            format: {
              type: 'audio/pcm',
              rate: 24000,
            },
          },
        },
        tracing: null,
        truncation: 'auto',
      },
    });

    return Response.json({
      clientSecret: secret.value,
      expiresAt: secret.expires_at,
      model: OPENAI_MODELS.REALTIME,
      voice: OPENAI_REALTIME_VOICE,
    });
  } catch (error) {
    console.error(
      'OpenAI Realtime session error:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return Response.json(
      { error: 'Failed to generate OpenAI Realtime session' },
      { status: 500 },
    );
  }
}
