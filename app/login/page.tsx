'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError('Invalid passcode. Try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-page p-6">
      <div className="w-full max-w-sm rounded-lg bg-surface p-8 shadow-input">
        <div className="mb-8 text-center">
          <h1
            className="font-serif text-3xl font-light text-text-primary"
            style={{ fontVariationSettings: '"opsz" 48' }}
          >
            Recall Deck
          </h1>
          <p className="mt-2 text-sm text-text-tertiary">
            Enter the demo passcode to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            id="passcode-input"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Passcode"
            className="w-full rounded-lg border-[0.5px] border-border-subtle bg-surface px-4 py-3
              text-center text-lg text-text-primary placeholder:text-text-tertiary/50
              transition-colors focus:border-accent focus:outline-none"
            autoFocus
            autoComplete="off"
          />

          {error && (
            <p className="text-center text-sm text-danger" role="alert">{error}</p>
          )}

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading || !passcode}
            className="h-10 w-full cursor-pointer rounded-lg bg-accent-strong text-sm font-medium text-white
              transition-opacity hover:opacity-90
              disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
