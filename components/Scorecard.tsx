'use client';

import React from 'react';

interface ScorecardProps {
  score: number;
  total: number;
  streak: number;
  onBackToChat: () => void;
}

export default function Scorecard({ score, total, streak, onBackToChat }: ScorecardProps) {
  const percentage = Math.round((score / total) * 100);
  const isPerfect = score === total;
  const isZero = score === 0;

  let headline = '';
  let subline = '';

  if (isPerfect) {
    headline = 'EXCELLENT RESULT';
    subline = 'The Professor is... quietly impressed.';
  } else if (isZero) {
    headline = 'CONCEPTUAL GAPS';
    subline = 'The Professor recommends a trip back to the library.';
  } else if (score >= 2) {
    headline = 'SOLID PERFORMANCE';
    subline = 'You got most of them. Ready for more advanced questions next time?';
  } else {
    headline = 'DEVELOPING UNDERSTANDING';
    subline = 'A good start, but there are a few core traps to watch out for.';
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8 text-center bg-surface border border-border-subtle rounded-2xl shadow-md max-w-sm mx-auto">
      {/* Score circle */}
      <div className="relative w-32 h-32">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="var(--color-border-soft)"
            strokeWidth="8"
          />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke={isPerfect ? '#2F855A' : isZero ? 'var(--color-danger)' : 'var(--color-accent)'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / total) * 314} 314`}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-text-primary">
            {score}/{total}
          </span>
          <span className="text-xs text-text-tertiary">{percentage}%</span>
        </div>
      </div>

      {/* Headline */}
      <div>
        <h2
          className="text-xl font-bold tracking-wider"
          style={{
            color: isPerfect ? '#2F855A' : isZero ? 'var(--color-danger)' : 'var(--color-accent)',
            fontFamily: "var(--font-fraunces), Georgia, serif",
          }}
        >
          {headline}
        </h2>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed">{subline}</p>
      </div>

      {/* Streak info */}
      {streak > 0 && (
        <div className="flex items-center gap-2 text-accent">
          <span className="text-lg">🔥</span>
          <span className="text-sm font-semibold font-mono">Streak: {streak}</span>
        </div>
      )}

      {/* Back to chat */}
      <button
        id="back-to-chat-btn"
        onClick={onBackToChat}
        className="mt-4 px-8 py-3 bg-accent text-surface rounded-xl font-bold text-base
          hover:bg-accent-strong active:scale-95 transition-all duration-200 cursor-pointer shadow-md shadow-accent/15"
        style={{ touchAction: 'manipulation' }}
      >
        RETURN TO CHAT
      </button>

      {/* Future teaser */}
      <p className="text-xs text-text-tertiary/70 max-w-[240px] leading-relaxed">
        The Professor remembers. Concepts you missed will resurface in later sessions.
      </p>
    </div>
  );
}
