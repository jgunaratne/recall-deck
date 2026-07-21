import { toFile } from 'openai';
import { getOpenAIClient } from '@/lib/openai';

export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const audio = await request.arrayBuffer();
    const mimeType = request.headers.get('content-type')?.split(';')[0] || 'audio/webm';
    if (!audio.byteLength) {
      return Response.json({ error: 'Recorded audio is required.' }, { status: 400 });
    }
    if (audio.byteLength > MAX_AUDIO_BYTES) {
      return Response.json({ error: 'The recorded question is too long.' }, { status: 413 });
    }

    const fileName = mimeType === 'audio/mp4'
      ? 'question.mp4'
      : mimeType === 'audio/wav'
        ? 'question.wav'
        : 'question.webm';
    const file = await toFile(Buffer.from(audio), fileName, { type: mimeType });
    const transcription = await getOpenAIClient().audio.transcriptions.create({
      file,
      model: 'gpt-4o-mini-transcribe',
    });
    const transcript = transcription.text.trim();
    if (!transcript) {
      return Response.json({ error: 'OpenAI could not understand the recorded question.' }, { status: 422 });
    }

    return Response.json({ transcript });
  } catch (error) {
    console.error(
      'OpenAI question transcription error:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return Response.json({ error: 'Unable to transcribe the recorded question.' }, { status: 500 });
  }
}
