'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { QuizQuestion, Answer } from '@/lib/schema';
import AnswerButton from './AnswerButton';
import FuseTimer from './FuseTimer';
import Scorecard from './Scorecard';
import { PROFESSOR_INTRO_LINES } from '@/lib/prompts';

type QuizPhase = 'intro' | 'question' | 'reveal' | 'scorecard';

interface QuizTakeoverProps {
  transcript: string;
  provider: string;
  onClose: () => void;
}

const QUESTIONS_PER_ROUND = 3;
const TIMER_DURATION_MS = 20000;
const DIFFICULTIES: Array<'warmup' | 'solid' | 'spicy'> = ['warmup', 'solid', 'spicy'];

export default function QuizTakeover({ transcript, provider, onClose }: QuizTakeoverProps) {
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
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Fetch a quiz question from the API
  const fetchQuestion = useCallback(
    async (difficulty: 'warmup' | 'solid' | 'spicy'): Promise<QuizQuestion> => {
      const res = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, difficulty, provider }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate question');
      }

      return res.json();
    },
    [transcript, provider]
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
      const question = await fetchQuestion(DIFFICULTIES[0]);
      setCurrentQuestion(question);
      setPhase('question');
      questionStartTimeRef.current = performance.now();
    } catch {
      setError('Failed to generate questions. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchQuestion]);

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

      setMontyBanter('');
      setPhase('reveal');

      // Pre-fetch next question concurrently while user reads feedback (if not last)
      const nextIndex = questionIndex + 1;
      if (nextIndex < QUESTIONS_PER_ROUND) {
        fetchQuestion(DIFFICULTIES[nextIndex])
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
    [currentQuestion, chosenIndex, questionIndex, fetchQuestion, streamMontyReaction, streak]
  );

  // Advance to next question or scorecard
  const handleNext = useCallback(async () => {
    const nextIndex = questionIndex + 1;

    if (nextIndex >= QUESTIONS_PER_ROUND) {
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
        const q = await fetchQuestion(DIFFICULTIES[nextIndex]);
        setCurrentQuestion(q);
        setPhase('question');
        questionStartTimeRef.current = performance.now();
      } catch {
        setError('Failed to load next question. Try again.');
      } finally {
        setIsLoading(false);
      }
    }
  }, [questionIndex, fetchQuestion]);

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

  const animationClass = reducedMotion.current ? 'animate-fade-in' : 'animate-slide-up';

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
      <div className="flex items-center justify-between px-4 pt-3 pb-2 relative z-10 border-b border-border-soft">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎓</span>
          <span
            className="text-accent font-bold text-lg tracking-wider"
            style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
          >
            POP QUIZ
          </span>
        </div>
        <div className="flex items-center gap-3">
          {phase !== 'scorecard' && (
            <span className="text-text-tertiary text-sm font-mono">
              Question {questionIndex + 1} of {QUESTIONS_PER_ROUND}
            </span>
          )}
          <button
            id="quiz-close-btn"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary text-xl transition-colors cursor-pointer"
            aria-label="Close quiz"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col px-4 pb-4 relative z-10 overflow-y-auto mt-4">
        {/* INTRO PHASE */}
        {phase === 'intro' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center animate-fade-in">
            <div
              className="text-4xl font-bold text-accent tracking-wide"
              style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
            >
              Pop Quiz
            </div>
            <p className="text-text-primary/80 text-base max-w-[320px] leading-relaxed italic">
              &ldquo;{introLine}&rdquo;
            </p>
            {isLoading && (
              <div className="flex items-center gap-2 text-accent/75 text-sm font-mono">
                <span className="animate-spin">⏳</span>
                <span>The Professor is writing your quiz...</span>
              </div>
            )}
            {error && (
              <div className="text-danger text-sm font-mono">
                {error}
                <button
                  onClick={startQuiz}
                  className="block mx-auto mt-2 px-4 py-2 bg-accent text-surface rounded-lg font-bold text-xs"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* QUESTION PHASE */}
        {phase === 'question' && currentQuestion && (
          <div className="flex-1 flex flex-col gap-4 animate-fade-in">
            {/* Timer */}
            <FuseTimer
              key={questionIndex}
              durationMs={TIMER_DURATION_MS}
              onExpire={handleTimerExpire}
              isPaused={false}
            />

            {/* Host intro */}
            <p
              className="text-text-tertiary text-xs italic text-center opacity-85 font-mono"
            >
              &ldquo;{currentQuestion.host_intro}&rdquo;
            </p>

            {/* Question */}
            <h2
              className="text-lg md:text-xl font-medium text-text-primary text-center leading-relaxed mt-1"
              style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
            >
              {currentQuestion.question}
            </h2>

            {/* Difficulty badge */}
            <div className="flex justify-center">
              <span
                className={`text-[10px] tracking-wider px-3 py-1 rounded-full font-bold font-mono ${
                  currentQuestion.difficulty === 'warmup'
                    ? 'bg-[#2F855A]/10 text-[#2F855A]'
                    : currentQuestion.difficulty === 'solid'
                    ? 'bg-accent/10 text-accent'
                    : 'bg-danger/10 text-danger'
                }`}
              >
                {currentQuestion.difficulty.toUpperCase()}
              </span>
            </div>

            {/* Spacer */}
            <div className="flex-1 min-h-4" />

            {/* Answers */}
            <div className="flex flex-col gap-3">
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
          <div className="flex-1 flex flex-col gap-4 animate-fade-in">
            {/* Frozen timer */}
            <FuseTimer
              key={`reveal-${questionIndex}`}
              durationMs={TIMER_DURATION_MS}
              onExpire={() => {}}
              isPaused={true}
            />

            {/* Question (dimmed) */}
            <h2
              className="text-base text-text-primary/55 text-center leading-relaxed"
              style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
            >
              {currentQuestion.question}
            </h2>

            {/* Answers with reveal */}
            <div className="flex flex-col gap-3">
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

            {/* Banter Card */}
            <div className="mt-2 p-4 bg-surface border border-border-subtle shadow-sm rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0">💬</span>
                <p className="text-text-primary text-sm leading-relaxed italic">
                  {montyBanter || (
                    <span className="inline-block w-2 h-4 bg-accent animate-pulse rounded-sm align-middle" />
                  )}
                </p>
              </div>
            </div>

            {/* Next button */}
            <div className="flex-1 min-h-2" />
            <button
              id="next-question-btn"
              onClick={handleNext}
              className="w-full py-3 bg-accent text-surface rounded-xl font-bold text-sm
                hover:bg-accent-strong active:scale-95 transition-all duration-200 cursor-pointer shadow-md shadow-accent/15"
            >
              {questionIndex < QUESTIONS_PER_ROUND - 1 ? 'NEXT QUESTION' : 'SEE RESULTS'}
            </button>
          </div>
        )}

        {/* SCORECARD PHASE */}
        {phase === 'scorecard' && (
          <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
            <Scorecard
              score={score}
              total={QUESTIONS_PER_ROUND}
              streak={streak}
              onBackToChat={onClose}
            />
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && phase !== 'intro' && (
          <div className="absolute inset-0 bg-page/85 flex items-center justify-center z-20">
            <div className="text-accent text-sm flex items-center gap-2 font-mono">
              <span className="animate-spin">⏳</span>
              <span>Loading...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
