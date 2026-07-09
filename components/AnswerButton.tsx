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
  let bgClass = 'bg-surface hover:bg-state-hover active:bg-state-active border-border-subtle shadow-sm';
  let borderClass = 'border';
  let textClass = 'text-text-primary';

  if (isRevealed) {
    if (isCorrect) {
      bgClass = 'bg-[#2F855A]/10';
      borderClass = 'border-2 border-[#2F855A]';
      textClass = 'text-[#2F855A] font-bold';
    } else if (isChosen) {
      bgClass = 'bg-danger/10';
      borderClass = 'border-2 border-danger';
      textClass = 'text-danger font-bold';
    } else {
      bgClass = 'bg-state-hover-soft';
      borderClass = 'border border-border-soft';
      textClass = 'text-text-primary/30';
    }
  }

  return (
    <button
      id={`answer-btn-${index}`}
      onClick={onClick}
      disabled={disabled}
      className={`w-full min-h-[56px] px-4 py-3 rounded-xl ${bgClass} ${borderClass} ${textClass}
        text-left text-base font-medium transition-all duration-200
        touch-action-manipulation
        disabled:cursor-not-allowed
        flex items-center gap-3 cursor-pointer`}
      style={{ touchAction: 'manipulation' }}
    >
      <span
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
          isRevealed && isCorrect
            ? 'bg-[#2F855A] text-white'
            : isRevealed && isChosen
            ? 'bg-danger text-white'
            : 'bg-state-hover text-text-secondary/70 border border-border-soft'
        }`}
      >
        {LABELS[index]}
      </span>
      <span className="flex-1">{text}</span>
    </button>
  );
}
