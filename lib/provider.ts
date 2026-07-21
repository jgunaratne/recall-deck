/**
 * AI provider abstraction — switches between Anthropic and Gemini
 * based on the `provider` field in request bodies.
 *
 * Each route uses these helpers so the provider toggle is a single
 * code path, not duplicated per-endpoint.
 */

export type AIProvider = 'anthropic' | 'gemini';

const DEFAULT_PROVIDER: AIProvider = (process.env.DEFAULT_AI_PROVIDER as AIProvider) || 'gemini';

/**
 * Resolve which provider to use from a request body.
 * Falls back to env var DEFAULT_AI_PROVIDER, then 'gemini'.
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

/**
 * Return the other provider if it's available, or null if no fallback exists.
 */
export function getFallbackProvider(primary: AIProvider): AIProvider | null {
  const other: AIProvider = primary === 'anthropic' ? 'gemini' : 'anthropic';
  return isProviderAvailable(other) ? other : null;
}

/**
 * Check if an error is retryable with a fallback provider
 * (rate limit, overloaded, or token/quota exhaustion).
 */
export function shouldFallback(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error);
  let code = (error as { status?: number } | null)?.status;
  if (typeof code !== 'number') {
    const match = raw.match(/"code"\s*:\s*(\d{3})/);
    if (match) code = parseInt(match[1], 10);
  }
  // Rate limit, overloaded, or insufficient quota / tokens
  if (code === 429 || code === 503 || code === 529) return true;
  // Anthropic-specific: credit balance / token errors
  if (/credit|balance|quota|token.*limit|rate.*limit|overloaded|capacity/i.test(raw)) return true;
  return false;
}
