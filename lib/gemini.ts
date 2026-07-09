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

// Model constants — matching Hansel's pattern
export const GEMINI_MODELS = {
  CHAT: 'gemini-3.5-flash',
  QUIZ_GENERATE: 'gemini-3.5-flash',
  QUIZ_REACT: 'gemini-2.5-flash-lite',
} as const;
