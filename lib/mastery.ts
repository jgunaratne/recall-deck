// Topic mastery model. A "topic" is a conversation: its lecture cards are what
// the user studied, and its quiz records are the evidence of recall. Mastery is
// driven by recency-weighted quiz accuracy — recent quizzes count more, so a
// topic can be lost and re-earned — with study depth (deep dives) as flavor.

import { splitIntoCards } from './cards';
import type { Conversation } from './history';

export type MasteryLevel =
  | 'not-started'
  | 'learning'
  | 'developing'
  | 'proficient'
  | 'mastered';

export type TopicMastery = {
  level: MasteryLevel;
  /** 0..1 — fills the progress ring/bar. */
  score: number;
  /** Recency-weighted quiz accuracy (0..1), or null before the first quiz. */
  accuracy: number | null;
  quizzesTaken: number;
  cardsStudied: number;
  /** Number of lectures the topic spans — grows with each deep dive. */
  depth: number;
  trend: 'improving' | 'slipping' | 'steady' | null;
  /** Learner-facing guidance: what the level means and what to do next. */
  feedback: string;
};

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  'not-started': 'Not started',
  learning: 'Learning',
  developing: 'Developing',
  proficient: 'Proficient',
  mastered: 'Mastered',
};

/** Text color per level, matching the quiz-score tones used in the sidebar. */
export const MASTERY_TEXT_CLASS: Record<MasteryLevel, string> = {
  'not-started': 'text-text-tertiary',
  learning: 'text-text-tertiary',
  developing: 'text-amber-700',
  proficient: 'text-emerald-700',
  mastered: 'text-emerald-700',
};

/** Fill color for progress bars/rings per level. */
export const MASTERY_FILL_CLASS: Record<MasteryLevel, string> = {
  'not-started': 'bg-border-subtle',
  learning: 'bg-accent/60',
  developing: 'bg-amber-500',
  proficient: 'bg-emerald-500',
  mastered: 'bg-emerald-600',
};

// A topic is mastered when accuracy holds up across repeated quizzes — one
// lucky perfect round only reaches "proficient".
const MASTERED_MIN_QUIZZES = 2;
const MASTERED_MIN_ACCURACY = 0.85;
const MASTERED_MIN_LAST_QUIZ = 0.8;

export function computeMastery(conversation: Conversation): TopicMastery {
  const cardsStudied = conversation.messages
    .filter((m) => m.role === 'assistant')
    .reduce((sum, m) => sum + splitIntoCards(m.content).length, 0);
  const depth = conversation.messages.filter((m) => m.role === 'assistant').length;

  const ratios = conversation.quizzes
    .filter((q) => q.total > 0)
    .map((q) => q.score / q.total);
  const quizzesTaken = ratios.length;

  // Recency-weighted accuracy: quiz i gets weight i+1, so the latest quiz
  // matters most but history still counts.
  let accuracy: number | null = null;
  if (quizzesTaken > 0) {
    let weighted = 0;
    let totalWeight = 0;
    ratios.forEach((r, i) => {
      const w = i + 1;
      weighted += r * w;
      totalWeight += w;
    });
    accuracy = weighted / totalWeight;
  }

  const lastRatio = quizzesTaken > 0 ? ratios[quizzesTaken - 1] : null;
  const prevRatio = quizzesTaken > 1 ? ratios[quizzesTaken - 2] : null;
  const trend =
    lastRatio === null || prevRatio === null
      ? null
      : lastRatio > prevRatio
        ? 'improving'
        : lastRatio < prevRatio
          ? 'slipping'
          : 'steady';

  let level: MasteryLevel;
  if (accuracy === null) {
    level = cardsStudied > 0 ? 'learning' : 'not-started';
  } else if (
    quizzesTaken >= MASTERED_MIN_QUIZZES &&
    accuracy >= MASTERED_MIN_ACCURACY &&
    (lastRatio ?? 0) >= MASTERED_MIN_LAST_QUIZ
  ) {
    level = 'mastered';
  } else if (accuracy >= 0.8) {
    level = 'proficient';
  } else if (accuracy >= 0.5) {
    level = 'developing';
  } else {
    level = 'learning';
  }

  // Ring fill: before any quiz, studying alone fills a sliver; after that,
  // accuracy drives it, discounted until a second quiz confirms consistency.
  let score: number;
  if (accuracy === null) {
    score = Math.min(0.2, cardsStudied * 0.02);
  } else {
    const consistency = Math.min(1, quizzesTaken / MASTERED_MIN_QUIZZES);
    score = accuracy * (0.7 + 0.3 * consistency);
  }
  if (level === 'mastered') score = 1;

  return {
    level,
    score,
    accuracy,
    quizzesTaken,
    cardsStudied,
    depth,
    trend,
    feedback: buildFeedback(level, accuracy, quizzesTaken, cardsStudied, depth, trend),
  };
}

function buildFeedback(
  level: MasteryLevel,
  accuracy: number | null,
  quizzesTaken: number,
  cardsStudied: number,
  depth: number,
  trend: TopicMastery['trend'],
): string {
  const pct = accuracy === null ? null : Math.round(accuracy * 100);

  switch (level) {
    case 'not-started':
      return 'Ask a question to start studying this topic.';
    case 'learning':
      if (quizzesTaken === 0) {
        return `${cardsStudied} card${cardsStudied === 1 ? '' : 's'} studied — take a pop quiz to start building mastery.`;
      }
      if (trend === 'slipping') {
        return 'Slipping — your last quiz dropped. Reread the cards before trying again.';
      }
      return `Needs review — accuracy is at ${pct}%. Reread the cards, then retake the quiz.`;
    case 'developing':
      if (trend === 'improving') {
        return `Improving — your last quiz was your best yet. Keep quizzing to reach proficiency.`;
      }
      if (trend === 'slipping') {
        return `Slipping — your last quiz dropped. Review the cards to regain ground.`;
      }
      return `Developing — ${pct}% accuracy. Review what you missed, then quiz again.`;
    case 'proficient':
      if (quizzesTaken < MASTERED_MIN_QUIZZES) {
        return 'Strong start — one more strong quiz confirms mastery.';
      }
      return `So close — score ${Math.round(MASTERED_MIN_LAST_QUIZ * 100)}%+ on your next quiz to reach mastery.`;
    case 'mastered':
      if (depth > 1) {
        return `Mastered at ${pct}% accuracy — and it held across ${depth} deep dives.`;
      }
      return `Mastered at ${pct}% accuracy. Go deeper to stretch it further.`;
  }
}
