import { getGeminiClient } from '@/lib/gemini';
import { getOpenAIClient, OPENAI_MODELS } from '@/lib/openai';

export const runtime = 'nodejs';

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

function illustrationPrompt(content: string): string {
  return `Create a simple, clean educational illustration that visually represents the key concept described below. Use a flat design style with soft, harmonious colors on a light background. Do not include any text, labels, or words in the image. The illustration should be conceptual and elegant.\n\n${content.slice(0, 600)}`;
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/exceeded your current quota|billing details|insufficient_quota/i.test(raw)) {
    return 'The OpenAI account has no available API quota. Check billing and project limits, then try again.';
  }
  return 'Unable to generate an illustration right now.';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.content !== 'string' || !body.content.trim()) {
      return Response.json({ error: 'Card content is required.' }, { status: 400 });
    }

    const prompt = illustrationPrompt(body.content);

    async function generateWithGemini() {
      const result = await getGeminiClient().models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: prompt,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: '3:2' },
        },
      });
      const image = result.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
      if (!image?.data) throw new Error('Gemini returned no image data.');
      return Response.json({
        image: `data:${image.mimeType || 'image/png'};base64,${image.data}`,
        provider: 'gemini',
      });
    }

    // Claude has no image model, so when it's the selected provider the standing
    // rule is to illustrate with Gemini rather than silently charge OpenAI.
    if (body.provider === 'anthropic') {
      if (process.env.GEMINI_API_KEY) return await generateWithGemini();
      return Response.json(
        { error: 'Image generation with Claude selected requires GEMINI_API_KEY.' },
        { status: 503 },
      );
    }

    // Do not silently charge Gemini after an OpenAI failure. Gemini is only
    // used when OpenAI has not been configured.
    if (process.env.OPENAI_API_KEY) {
      const result = await getOpenAIClient().images.generate({
        model: OPENAI_MODELS.IMAGE,
        prompt,
        size: '1536x1024',
        quality: 'low',
        output_format: 'png',
      });
      const image = result.data?.[0]?.b64_json;
      if (!image) throw new Error('OpenAI returned no image data.');
      return Response.json({ image: `data:image/png;base64,${image}`, provider: 'openai' });
    }

    if (process.env.GEMINI_API_KEY) {
      return await generateWithGemini();
    }

    return Response.json(
      { error: 'Image generation requires OPENAI_API_KEY or GEMINI_API_KEY.' },
      { status: 503 },
    );
  } catch (error) {
    console.error('Image generation error:', error instanceof Error ? error.message : error);
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
