import Anthropic from '@anthropic-ai/sdk';

// Singleton client - server-side only
let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Model constants
export const MODELS = {
  CHAT: 'claude-sonnet-4-6-20250514' as const,
  QUIZ_GENERATE: 'claude-sonnet-4-6-20250514' as const,
  QUIZ_REACT: 'claude-haiku-4-5-20250414' as const,
} as const;
