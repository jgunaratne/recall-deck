'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { QuizQuestion } from '@/lib/schema';
import type { MasteryLevel, TopicMastery } from '@/lib/mastery';
import AnswerButton from './AnswerButton';
import FuseTimer from './FuseTimer';
import Scorecard from './Scorecard';
import { PROFESSOR_INTRO_LINES, type ReadingLevel } from '@/lib/prompts';

function Spinner() {
  // Sync to global clock so the animation continues smoothly across remounts.
  const [delay] = useState(() => -(Date.now() % 1000));
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'spin 1s linear infinite', animationDelay: `${delay}ms` }}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

type QuizPhase = 'intro' | 'question' | 'reveal' | 'scorecard';

interface QuizTakeoverProps {
  /** The student's question that produced the lecture. */
  question: string;
  /** Lecture card contents — each quiz question is grounded in one card. */
  cards: string[];
  provider: string;
  readingLevel?: ReadingLevel;
  /** Topic mastery after the quiz is recorded — shown on the scorecard. */
  mastery?: TopicMastery | null;
  /** Mastery level before this quiz, to celebrate level-ups. */
  previousMasteryLevel?: MasteryLevel | null;
  onReturnToHome: () => void;
  onGoDeeper: () => void;
  onClose: () => void;
  onComplete?: (score: number, total: number) => void;
  /** Fires when a question is shown — feeds the voice tutor's context. */
  onQuestionShown?: (context: string) => void;
  /** Fires when the student answers — feeds the result to the voice tutor. */
  onAnswerGiven?: (context: string) => void;
  /** Fires when the quiz ends — lets the voice tutor remark on the final score. */
  onQuizFinished?: (context: string) => void;
  onOpenSidebar?: () => void;
}

const QUESTIONS_PER_ROUND = 5;
const TIMER_DURATION_MS = 45000;
const DIFFICULTIES: Array<'warmup' | 'solid' | 'spicy'> = ['warmup', 'warmup', 'solid', 'solid', 'spicy'];

export default function QuizTakeover({ question, cards, provider, readingLevel = 'high', mastery, previousMasteryLevel, onReturnToHome, onGoDeeper, onClose, onComplete, onQuestionShown, onAnswerGiven, onQuizFinished, onOpenSidebar }: QuizTakeoverProps) {
  const [phase, setPhase] = useState<QuizPhase>('intro');
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [montyBanter, setMontyBanter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [introLine] = useState(() =>
    PROFESSOR_INTRO_LINES[Math.floor(Math.random() * PROFESSOR_INTRO_LINES.length)]
  );

  const questionStartTimeRef = useRef<number>(0);
  const prefetchedQuestionRef = useRef<QuizQuestion | null>(null);
  const generatedQuestionsRef = useRef<QuizQuestion[]>([]);

  // Fetch a quiz question from the API. Each question is grounded in one
  // lecture card: question i uses card i (wrapping if there are fewer cards
  // than questions), so the quiz tests exactly what the cards taught.
  const fetchQuestion = useCallback(
    async (index: number): Promise<QuizQuestion> => {
      const difficulty = DIFFICULTIES[index];
      const cardIndex = cards.length > 0 ? index % cards.length : 0;
      const card = cards[cardIndex] ?? '';
      const transcript = [
        `Student asked: ${question}`,
        '',
        `Tutor's lecture notes (card ${cardIndex + 1} of ${cards.length}) — base the question ONLY on this content:`,
        card,
      ].join('\n');

      const previousQuestions = generatedQuestionsRef.current
        .filter((q): q is QuizQuestion => !!q)
        .map((q) => q.question);

      const res = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          difficulty,
          provider,
          readingLevel,
          previousQuestions,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate question');
      }

      const q = await res.json();
      generatedQuestionsRef.current[index] = q;
      return q;
    },
    [question, cards, provider, readingLevel]
  );

  // Stream Monty's reaction
  const streamMontyReaction = useCallback(
    async (payload: {
      question: string;
      chosen: { text: string; why_tempting: string };
      correct: { text: string; why_tempting: string };
      was_correct: boolean;
      streak: number;
      response_time_s: number;
    }) => {
      const res = await fetch('/api/quiz/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, provider }),
      });

      if (!res.ok) {
        throw new Error('Failed to get reaction');
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'text') {
                setMontyBanter((prev) => prev + parsed.text);
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }
    },
    [provider]
  );

  // Start the quiz - fetch first question
  const startQuiz = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      generatedQuestionsRef.current = [];
      const firstQuestion = await fetchQuestion(0);
      setCurrentQuestion(firstQuestion);
      setPhase('question');
      questionStartTimeRef.current = performance.now();
    } catch {
      setError('Failed to generate questions. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchQuestion]);

  // Surface each question to the voice tutor as it appears. The answer
  // options are included, but not which one is correct — the tutor should
  // build suspense, not blurt the answer.
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion) return;
    const context = [
      `Question ${questionIndex + 1} of ${QUESTIONS_PER_ROUND} (difficulty: ${currentQuestion.difficulty}):`,
      currentQuestion.question,
      ...currentQuestion.answers.map((a, i) => `${String.fromCharCode(65 + i)}. ${a.text}`),
    ].join('\n');
    onQuestionShown?.(context);
  }, [phase, currentQuestion, questionIndex, onQuestionShown]);

  // Auto-start after intro
  useEffect(() => {
    if (phase === 'intro') {
      const timer = setTimeout(() => {
        startQuiz();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [phase, startQuiz]);

  // Handle answer selection
  const handleAnswer = useCallback(
    async (answerIndex: number) => {
      if (!currentQuestion || chosenIndex !== null) return;

      const responseTime = (performance.now() - questionStartTimeRef.current) / 1000;
      setChosenIndex(answerIndex);

      const chosen = currentQuestion.answers[answerIndex];
      const correct = currentQuestion.answers.find((a) => a.is_correct)!;
      const wasCorrect = chosen.is_correct;

      if (wasCorrect) {
        setScore((prev) => prev + 1);
        setStreak((prev) => prev + 1);
      } else {
        setStreak(0);
      }

      // Notify the voice tutor about the student's answer so it can react
      if (onAnswerGiven) {
        const answerContext = [
          `[STUDENT ANSWERED — Question ${questionIndex + 1}]`,
          `Question: ${currentQuestion.question}`,
          `Student chose: ${chosen.text}`,
          wasCorrect
            ? `That is CORRECT! 🎉`
            : `That is INCORRECT. The correct answer was: ${correct.text}`,
          `Response time: ${responseTime.toFixed(1)}s`,
        ].join('\n');
        onAnswerGiven(answerContext);
      }

      setMontyBanter('');
      setPhase('reveal');

      // Pre-fetch next question concurrently while user reads feedback (if not last)
      const nextIndex = questionIndex + 1;
      if (nextIndex < QUESTIONS_PER_ROUND) {
        fetchQuestion(nextIndex)
          .then((q) => {
            prefetchedQuestionRef.current = q;
          })
          .catch(() => {
            // Silently fail pre-fetch; handleNext will retry synchronously if missing
          });
      }

      try {
        await streamMontyReaction({
          question: currentQuestion.question,
          chosen: { text: chosen.text, why_tempting: chosen.why_tempting },
          correct: { text: correct.text, why_tempting: correct.why_tempting },
          was_correct: wasCorrect,
          streak: wasCorrect ? streak + 1 : 0,
          response_time_s: responseTime,
        });
      } catch (err) {
        console.error('Failed to get feedback reaction:', err);
      }
    },
    [currentQuestion, chosenIndex, questionIndex, fetchQuestion, streamMontyReaction, streak, onAnswerGiven]
  );

  // Advance to next question or scorecard
  const handleNext = useCallback(async () => {
    const nextIndex = questionIndex + 1;

    if (nextIndex >= QUESTIONS_PER_ROUND) {
      onComplete?.(score, QUESTIONS_PER_ROUND);
      onQuizFinished?.(
        [
          '[QUIZ COMPLETE]',
          `The quiz is over. Final score: ${score} out of ${QUESTIONS_PER_ROUND}.`,
          streak > 1 ? `The student finished on a ${streak}-question streak.` : '',
        ]
          .filter(Boolean)
          .join('\n')
      );
      setPhase('scorecard');
      return;
    }

    setChosenIndex(null);
    setMontyBanter('');
    setQuestionIndex(nextIndex);

    if (prefetchedQuestionRef.current) {
      setCurrentQuestion(prefetchedQuestionRef.current);
      prefetchedQuestionRef.current = null;
      setPhase('question');
      questionStartTimeRef.current = performance.now();
    } else {
      setIsLoading(true);
      setError(null);
      try {
        const q = await fetchQuestion(nextIndex);
        setCurrentQuestion(q);
        setPhase('question');
        questionStartTimeRef.current = performance.now();
      } catch {
        setError('Failed to load next question. Try again.');
      } finally {
        setIsLoading(false);
      }
    }
  }, [questionIndex, fetchQuestion, onComplete, onQuizFinished, score, streak]);

  // Handle timer expiry (treat as incorrect)
  const handleTimerExpire = useCallback(() => {
    if (!currentQuestion || chosenIndex !== null) return;
    const correctIndex = currentQuestion.answers.findIndex((a) => a.is_correct);
    handleAnswer(correctIndex === 0 ? 1 : 0); // Trigger chosen wrong index
  }, [currentQuestion, chosenIndex, handleAnswer]);

  // Keyboards listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (phase === 'question' && chosenIndex === null) {
        const keyMap: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
        const index = keyMap[e.key.toLowerCase()];
        if (index !== undefined) {
          handleAnswer(index);
        }
      }
      if (phase === 'reveal' && (e.key === 'Enter' || e.key === ' ')) {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, chosenIndex, handleAnswer, handleNext]);

  const spinner = <Spinner />;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-page"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Header */}
      <div className="relative z-10 flex h-[var(--header-height)] shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {onOpenSidebar && (
            <button
              type="button"
              onClick={onOpenSidebar}
              aria-label="Open sidebar"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md
                text-text-secondary transition-colors hover:bg-state-hover"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
          )}
          <span className="px-2 font-serif text-lg text-text-primary">Pop Quiz</span>
        </div>
        <div className="flex items-center gap-3">
          {phase !== 'scorecard' && (
            <span className="text-sm tabular-nums text-text-tertiary">
              Question {questionIndex + 1} of {QUESTIONS_PER_ROUND}
            </span>
          )}
          <button
            id="quiz-close-btn"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-tertiary
              transition-colors hover:bg-state-hover hover:text-text-primary"
            aria-label="Close quiz"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="scroll-area relative z-10 mx-auto mt-4 flex w-full max-w-[var(--input-max-width)] flex-1 flex-col overflow-y-auto px-4 pb-6">
        {/* INTRO PHASE */}
        {phase === 'intro' && (
          <div className="flex flex-1 animate-fade-in flex-col items-center justify-center gap-6 text-center">
            <div
              className="font-serif text-[40px] font-light leading-[52px] text-text-secondary"
              style={{ fontVariationSettings: '"opsz" 48' }}
            >
              Pop Quiz
            </div>
            <p className="max-w-[360px] text-base italic leading-relaxed text-text-secondary">
              &ldquo;{introLine}&rdquo;
            </p>
            {isLoading && (
              <div className="flex items-center gap-2.5 text-sm text-text-tertiary">
                {spinner}
                <span>Writing a quiz for you…</span>
              </div>
            )}
            {error && (
              <div className="text-sm text-danger">
                {error}
                <button
                  onClick={startQuiz}
                  className="mx-auto mt-3 block h-8 cursor-pointer rounded-md bg-accent-strong px-3.5
                    text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* QUESTION PHASE */}
        {phase === 'question' && currentQuestion && (
          <div className="flex flex-1 animate-fade-in flex-col gap-4">
            {/* Timer */}
            <FuseTimer
              key={questionIndex}
              durationMs={TIMER_DURATION_MS}
              onExpire={handleTimerExpire}
              isPaused={false}
            />

            {/* Host intro */}
            <p className="text-center text-sm italic text-text-tertiary">
              &ldquo;{currentQuestion.host_intro}&rdquo;
            </p>

            {/* Question */}
            <h2 className="mt-1 text-center font-serif text-xl leading-relaxed text-text-primary md:text-2xl">
              {currentQuestion.question}
            </h2>

            {/* Difficulty badge */}
            <div className="flex justify-center">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  currentQuestion.difficulty === 'warmup'
                    ? 'bg-emerald-100 text-emerald-800'
                    : currentQuestion.difficulty === 'solid'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {currentQuestion.difficulty === 'warmup'
                  ? 'Warm-up'
                  : currentQuestion.difficulty === 'solid'
                  ? 'Solid'
                  : 'Spicy'}
              </span>
            </div>

            {/* Spacer */}
            <div className="min-h-4 flex-1" />

            {/* Answers */}
            <div className="flex flex-col gap-2.5">
              {currentQuestion.answers.map((answer, idx) => (
                <AnswerButton
                  key={idx}
                  text={answer.text}
                  index={idx}
                  isRevealed={false}
                  isCorrect={answer.is_correct}
                  isChosen={false}
                  disabled={false}
                  onClick={() => handleAnswer(idx)}
                />
              ))}
            </div>
          </div>
        )}

        {/* REVEAL PHASE */}
        {phase === 'reveal' && currentQuestion && (
          <div className="flex flex-1 animate-fade-in flex-col gap-4">
            {/* Frozen timer */}
            <FuseTimer
              key={`reveal-${questionIndex}`}
              durationMs={TIMER_DURATION_MS}
              onExpire={() => {}}
              isPaused={true}
            />

            {/* Question (dimmed) */}
            <h2 className="text-center font-serif text-base leading-relaxed text-text-primary/55">
              {currentQuestion.question}
            </h2>

            {/* Answers with reveal */}
            <div className="flex flex-col gap-2.5">
              {currentQuestion.answers.map((answer, idx) => (
                <AnswerButton
                  key={idx}
                  text={answer.text}
                  index={idx}
                  isRevealed={true}
                  isCorrect={answer.is_correct}
                  isChosen={idx === chosenIndex}
                  disabled={true}
                  onClick={() => {}}
                />
              ))}
            </div>

            {/* Banter card */}
            <div className="mt-2 rounded-lg bg-surface p-4 shadow-input">
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Feedback
              </div>
              <p className="text-sm italic leading-relaxed text-text-secondary">
                {montyBanter || (
                  <span className="inline-block h-4 w-2 animate-pulse rounded-xs bg-accent align-middle" />
                )}
              </p>
            </div>

            {/* Next button */}
            <div className="min-h-2 flex-1" />
            <button
              id="next-question-btn"
              onClick={handleNext}
              className="h-10 w-full cursor-pointer rounded-lg bg-accent-strong text-sm font-medium text-white
                transition-opacity hover:opacity-90"
            >
              {questionIndex < QUESTIONS_PER_ROUND - 1 ? 'Next question' : 'See results'}
            </button>
          </div>
        )}

        {/* SCORECARD PHASE */}
        {phase === 'scorecard' && (
          <div className="flex flex-1 animate-fade-in flex-col items-center justify-center">
            <Scorecard
              score={score}
              total={QUESTIONS_PER_ROUND}
              streak={streak}
              mastery={mastery}
              previousLevel={previousMasteryLevel}
              onReturnToHome={onReturnToHome}
              onGoDeeper={onGoDeeper}
            />
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && phase !== 'intro' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-page/85">
            <div className="flex items-center gap-2.5 text-sm text-text-tertiary">
              {spinner}
              <span>Loading…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
