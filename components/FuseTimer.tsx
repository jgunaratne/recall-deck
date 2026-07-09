'use client';

import React, { useEffect, useRef, useState } from 'react';

interface FuseTimerProps {
  durationMs: number;
  onExpire: () => void;
  isPaused: boolean;
}

export default function FuseTimer({ durationMs, onExpire, isPaused }: FuseTimerProps) {
  const [progress, setProgress] = useState(1); // 1 = full, 0 = expired
  const startTimeRef = useRef<number | null>(null);
  const elapsedBeforePauseRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    if (isPaused) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Save elapsed time when pausing
      if (startTimeRef.current !== null) {
        elapsedBeforePauseRef.current += performance.now() - startTimeRef.current;
        startTimeRef.current = null;
      }
      return;
    }

    hasExpiredRef.current = false;
    startTimeRef.current = performance.now();

    const tick = () => {
      if (startTimeRef.current === null) return;
      const totalElapsed = elapsedBeforePauseRef.current + (performance.now() - startTimeRef.current);
      const remaining = Math.max(0, 1 - totalElapsed / durationMs);
      setProgress(remaining);

      if (remaining <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onExpire();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPaused, durationMs, onExpire]);

  // No reset-on-prop-change effect needed: QuizTakeover remounts the timer
  // with a new `key` for every question, which resets all state.

  // Color: accent when > 30%, danger when ≤ 30%
  const barColor = progress > 0.3 ? 'var(--color-accent)' : 'var(--color-danger)';

  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-border-soft" role="timer" aria-label="Time remaining">
      <div
        className="h-full rounded-full"
        style={{
          width: `${progress * 100}%`,
          backgroundColor: barColor,
          transition: 'background-color 0.3s',
        }}
      />
    </div>
  );
}
