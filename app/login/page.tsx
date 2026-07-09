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
    <div className="min-h-dvh flex items-center justify-center bg-page p-6">
      <div className="w-full max-w-sm bg-surface border border-border-subtle p-8 rounded-2xl shadow-md">
        <div className="text-center mb-8">
          <h1
            className="text-4xl font-bold text-accent tracking-wider"
            style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
          >
            Recall Deck
          </h1>
          <p className="mt-2 text-sm text-text-tertiary/80">
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
            className="w-full px-4 py-3 bg-surface border border-border-subtle rounded-xl
              text-text-primary placeholder-text-tertiary/30 text-center text-lg
              focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20
              transition-all"
            autoFocus
            autoComplete="off"
          />

          {error && (
            <p className="text-danger text-sm text-center font-medium" role="alert">{error}</p>
          )}

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading || !passcode}
            className="w-full py-3 bg-accent text-surface rounded-xl font-bold text-base
              hover:bg-accent-strong active:scale-95 transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-accent/10"
          >
            {loading ? 'Checking...' : 'ENTER'}
          </button>
        </form>
      </div>
    </div>
  );
}
