'use client';

import React from 'react';
import {
  MASTERY_FILL_CLASS,
  MASTERY_LABELS,
  MASTERY_TEXT_CLASS,
  type MasteryLevel,
  type TopicMastery,
} from '@/lib/mastery';

interface ScorecardProps {
  score: number;
  total: number;
  streak: number;
  /** Topic mastery after this quiz was recorded. */
  mastery?: TopicMastery | null;
  /** Mastery level before this quiz, to celebrate level-ups. */
  previousLevel?: MasteryLevel | null;
  onReturnToHome: () => void;
  onGoDeeper: () => void;
}

const LEVEL_ORDER: MasteryLevel[] = ['not-started', 'learning', 'developing', 'proficient', 'mastered'];

export default function Scorecard({ score, total, streak, mastery, previousLevel, onReturnToHome, onGoDeeper }: ScorecardProps) {
  const percentage = Math.round((score / total) * 100);
  const isPerfect = score === total;
  const isZero = score === 0;

  let headline = '';
  let subline = '';

  if (isPerfect) {
    headline = 'Excellent result';
    subline = 'Great job! You have fully mastered these concepts.';
  } else if (isZero) {
    headline = 'Conceptual gaps';
    subline = 'Reviewing the material and trying again is recommended.';
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

      {/* Topic mastery development */}
      {mastery && (
        <div className="flex w-full flex-col gap-2 rounded-lg border border-border-soft bg-page/50 p-3 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-text-tertiary">
              Topic mastery
            </span>
            <span className={`text-xs font-semibold ${MASTERY_TEXT_CLASS[mastery.level]}`}>
              {previousLevel &&
              previousLevel !== mastery.level &&
              LEVEL_ORDER.indexOf(mastery.level) > LEVEL_ORDER.indexOf(previousLevel)
                ? `${MASTERY_LABELS[previousLevel]} → ${MASTERY_LABELS[mastery.level]}`
                : MASTERY_LABELS[mastery.level]}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${MASTERY_FILL_CLASS[mastery.level]}`}
              style={{ width: `${Math.round(mastery.score * 100)}%` }}
            />
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">{mastery.feedback}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex w-full flex-col gap-2">
        <button
          id="go-deeper-btn"
          onClick={onGoDeeper}
          className="h-10 w-full cursor-pointer rounded-lg bg-accent-strong text-sm font-medium text-white
            transition-opacity hover:opacity-90"
          style={{ touchAction: 'manipulation' }}
        >
          Go deeper on this topic
        </button>
        <button
          id="return-to-home-btn"
          onClick={onReturnToHome}
          className="h-10 w-full cursor-pointer rounded-lg border border-border-strong bg-surface text-sm font-medium text-text-primary
            transition-colors hover:bg-state-hover"
          style={{ touchAction: 'manipulation' }}
        >
          Return to home
        </button>
      </div>

      {/* Future teaser */}
      <p className="max-w-[260px] text-xs leading-relaxed text-text-tertiary">
        Concepts you missed will resurface in later sessions.
      </p>
    </div>
  );
}
