import { READING_LEVELS, type ReadingLevel } from '@/lib/prompts';
import { buildLiveSystemInstruction, getVoiceForLevel } from '@/lib/gemini-live-prompts';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Gemini Live config error: GEMINI_API_KEY is not set');
      return Response.json(
        { error: 'Gemini API key is not configured' },
        { status: 500 },
      );
    }

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

    const voice = getVoiceForLevel(readingLevel);
    const systemInstruction = buildLiveSystemInstruction(topic.trim(), readingLevel);

    return Response.json({ apiKey, voice, systemInstruction });
  } catch (error) {
    console.error(
      'Gemini Live config error:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return Response.json(
      { error: 'Failed to generate Gemini Live configuration' },
      { status: 500 },
    );
  }
}
