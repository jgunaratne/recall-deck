'use client';

import React from 'react';

type RenderingSpinnerProps = {
  label: string;
  className?: string;
};

export default function RenderingSpinner({ label, className }: RenderingSpinnerProps) {
  // Sync to global clock so animation continues smoothly across remounts.
  // A 1s animation cycle means we offset by -(now % 1000)ms.
  const delay = -(Date.now() % 1000);

  return (
    <div
      className={`bg-slate-50/50 border-slate-200/80 my-3 flex h-32 items-center justify-center rounded-xl border-2 ${
        className || ''
      }`}
    >
      <div className="text-[#20252D]/60 flex items-center gap-2.5 text-sm font-mono">
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          style={{
            animation: 'spin 1s linear infinite',
            animationDelay: `${delay}ms`,
          }}
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeOpacity="0.2"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        {label}
      </div>
    </div>
  );
}
