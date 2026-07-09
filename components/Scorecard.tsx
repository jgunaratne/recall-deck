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
    headline = 'Excellent result';
    subline = 'The Professor is... quietly impressed.';
  } else if (isZero) {
    headline = 'Conceptual gaps';
    subline = 'The Professor recommends a trip back to the library.';
  } else if (score >= 2) {
    headline = 'Solid performance';
    subline = 'You got most of them. Ready for more advanced questions next time?';
  } else {
    headline = 'Developing understanding';
    subline = 'A good start, but there are a few core traps to watch out for.';
  }

  const ringColor = isPerfect ? '#059669' : isZero ? 'var(--color-danger)' : 'var(--color-accent)';

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center justify-center gap-6 rounded-lg bg-surface p-8 text-center shadow-input">
      {/* Score circle */}
      <div className="relative h-32 w-32">
        <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 120 120">
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
            stroke={ringColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / total) * 314} 314`}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums text-text-primary">
            {score}/{total}
          </span>
          <span className="text-xs tabular-nums text-text-tertiary">{percentage}%</span>
        </div>
      </div>

      {/* Headline */}
      <div>
        <h2 className="font-serif text-2xl text-text-primary">{headline}</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">{subline}</p>
      </div>

      {/* Streak info */}
      {streak > 0 && (
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
          Streak · {streak} in a row
        </span>
      )}

      {/* Back to chat */}
      <button
        id="back-to-chat-btn"
        onClick={onBackToChat}
        className="mt-2 h-10 w-full cursor-pointer rounded-lg bg-accent-strong text-sm font-medium text-white
          transition-opacity hover:opacity-90"
        style={{ touchAction: 'manipulation' }}
      >
        Return to chat
      </button>

      {/* Future teaser */}
      <p className="max-w-[260px] text-xs leading-relaxed text-text-tertiary">
        The Professor remembers. Concepts you missed will resurface in later sessions.
      </p>
    </div>
  );
}
