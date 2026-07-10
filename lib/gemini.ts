import { GoogleGenAI } from '@google/genai';

// Singleton client — server-side only
let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

// Model constants — Gemini 3.5 Flash for content, with 2.5 Flash Lite as the
// fallback when 3.5 is unavailable or failing (see withGeminiFallback).
// QUIZ_REACT stays on Flash Lite deliberately: the reaction is a punchline,
// and time-to-first-token matters more than model strength there.
export const GEMINI_MODELS = {
  CHAT: 'gemini-3.5-flash',
  QUIZ_GENERATE: 'gemini-3.5-flash',
  QUIZ_REACT: 'gemini-2.5-flash-lite',
} as const;

export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/**
 * Run a Gemini request against the primary model, retrying once on the
 * fallback model if the primary is unavailable or failing at request time.
 * (Mid-stream failures after a stream has started are not retried.)
 */
export async function withGeminiFallback<T>(
  primaryModel: string,
  run: (model: string) => Promise<T>,
): Promise<T> {
  try {
    return await run(primaryModel);
  } catch (error) {
    console.warn(
      `Gemini model "${primaryModel}" failed (${error instanceof Error ? error.message : error}); retrying with "${GEMINI_FALLBACK_MODEL}"`,
    );
    return run(GEMINI_FALLBACK_MODEL);
  }
}
