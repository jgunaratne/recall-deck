import OpenAI from 'openai';
import type { EasyInputMessage } from 'openai/resources/responses/responses';

// Singleton client - server-side only
let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

// Model constants. Env overrides let deployments pin a model without a code
// change when OpenAI releases or deprecates model aliases.
export const OPENAI_MODELS = {
  CHAT: process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-terra',
  QUIZ_GENERATE: process.env.OPENAI_QUIZ_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-terra',
  QUIZ_REACT: process.env.OPENAI_REACTION_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-luna',
  REALTIME: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1-mini',
  IMAGE: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
} as const;

export const OPENAI_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';

export function toOpenAIInput(
  messages: Array<{ role: string; content: string }>,
): EasyInputMessage[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content,
  }));
}
