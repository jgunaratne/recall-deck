import { getAvailableProviders } from '@/lib/provider';

export const runtime = 'nodejs';

export async function GET() {
  const providers = getAvailableProviders();

  return new Response(JSON.stringify({ providers }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache, no-store',
    },
  });
}
