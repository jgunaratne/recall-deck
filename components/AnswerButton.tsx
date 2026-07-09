'use client';

import React from 'react';

interface AnswerButtonProps {
  text: string;
  index: number;
  isRevealed: boolean;
  isCorrect: boolean;
  isChosen: boolean;
  disabled: boolean;
  onClick: () => void;
}

const LABELS = ['A', 'B', 'C', 'D'];

export default function AnswerButton({
  text,
  index,
  isRevealed,
  isCorrect,
  isChosen,
  disabled,
  onClick,
}: AnswerButtonProps) {
  let buttonClass =
    'border-[0.5px] border-border-subtle bg-surface text-text-primary hover:bg-state-hover active:bg-state-active';
  let chipClass = 'bg-state-pill text-text-secondary';

  if (isRevealed) {
    if (isCorrect) {
      buttonClass = 'border border-emerald-600 bg-emerald-50 text-emerald-800 font-medium';
      chipClass = 'bg-emerald-600 text-white';
    } else if (isChosen) {
      buttonClass = 'border border-rose-600 bg-rose-50 text-rose-800 font-medium';
      chipClass = 'bg-rose-600 text-white';
    } else {
      buttonClass = 'border-[0.5px] border-border-soft bg-state-hover-soft text-text-primary/35';
      chipClass = 'bg-state-pill text-text-tertiary/50';
    }
  }

  return (
    <button
      id={`answer-btn-${index}`}
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3
        text-left font-text text-base transition-colors duration-200
        disabled:cursor-not-allowed ${buttonClass}`}
      style={{ touchAction: 'manipulation' }}
    >
      <span
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-sm font-medium transition-colors ${chipClass}`}
      >
        {LABELS[index]}
      </span>
      <span className="flex-1">{text}</span>
    </button>
  );
}
