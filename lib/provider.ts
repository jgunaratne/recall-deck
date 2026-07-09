/**
 * AI provider abstraction — switches between Anthropic and Gemini
 * based on the `provider` field in request bodies.
 *
 * Each route uses these helpers so the provider toggle is a single
 * code path, not duplicated per-endpoint.
 */

export type AIProvider = 'anthropic' | 'gemini';

const DEFAULT_PROVIDER: AIProvider = (process.env.DEFAULT_AI_PROVIDER as AIProvider) || 'anthropic';

/**
 * Resolve which provider to use from a request body.
 * Falls back to env var DEFAULT_AI_PROVIDER, then 'anthropic'.
 */
export function resolveProvider(body: { provider?: string }): AIProvider {
  const p = body.provider?.toLowerCase();
  if (p === 'gemini') return 'gemini';
  if (p === 'anthropic') return 'anthropic';
  return DEFAULT_PROVIDER;
}

/**
 * Check if a provider is available (has API key configured).
 */
export function isProviderAvailable(provider: AIProvider): boolean {
  if (provider === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  if (provider === 'gemini') return !!process.env.GEMINI_API_KEY;
  return false;
}

/**
 * Get available providers for the client to display.
 */
export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');
  if (process.env.GEMINI_API_KEY) providers.push('gemini');
  return providers;
}
