'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { Topic } from '@/lib/topics';

// ── Types ──────────────────────────────────────────────────────────────────

export type TopicStatusMap = Map<string, 'partial' | 'complete'>;

// ── Icons ──────────────────────────────────────────────────────────────────

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function HalfCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Partial progress: open book icon */}
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" stroke="currentColor" fill="none" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke="currentColor" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

interface TopicCarouselProps {
  topics: Topic[];
  /** Map of prompt → 'partial' | 'complete' */
  topicStatus: TopicStatusMap;
  /** Unique prefix for element IDs */
  idPrefix: string;
  onSelect: (prompt: string) => void;
  /** Called when the user scrolls near the end to load more topics */
  onLoadMore?: () => void;
}

export default function TopicCarousel({
  topics,
  topicStatus,
  idPrefix,
  onSelect,
  onLoadMore,
}: TopicCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const loadMoreTriggeredRef = useRef(0);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    const distanceToEnd = el.scrollWidth - el.scrollLeft - el.clientWidth;
    setCanScrollRight(distanceToEnd > 4);

    // When within 200px of the right edge, load more topics
    if (distanceToEnd < 200 && onLoadMore && topics.length > 0) {
      // Only trigger once per scroll-to-end (reset when topics grow)
      if (loadMoreTriggeredRef.current < topics.length) {
        loadMoreTriggeredRef.current = topics.length;
        onLoadMore();
      }
    }
  }, [onLoadMore, topics.length]);

  // Reset the trigger guard when topics grow (new batch appended)
  useEffect(() => {
    if (topics.length > loadMoreTriggeredRef.current) {
      loadMoreTriggeredRef.current = 0;
    }
  }, [topics.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, topics]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.clientWidth * 0.7;
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative">
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll('left')}
          aria-label="Scroll left"
          className="absolute -left-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 cursor-pointer
            items-center justify-center rounded-full border border-border-soft bg-surface
            text-text-secondary shadow-sm transition-all hover:bg-state-hover hover:text-text-primary"
        >
          <ChevronLeft />
        </button>
      )}

      {/* Right arrow */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll('right')}
          aria-label="Scroll right"
          className="absolute -right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 cursor-pointer
            items-center justify-center rounded-full border border-border-soft bg-surface
            text-text-secondary shadow-sm transition-all hover:bg-state-hover hover:text-text-primary"
        >
          <ChevronRight />
        </button>
      )}

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        className="topic-carousel flex gap-2 overflow-x-auto scroll-smooth pb-1"
        style={{
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <style>{`
          .topic-carousel::-webkit-scrollbar { display: none; }
        `}</style>

        {topics.map((seed, idx) => {
          const status = topicStatus.get(seed.prompt);
          const isComplete = status === 'complete';
          const isPartial = status === 'partial';

          return (
            <button
              key={`${seed.label}-${idx}`}
              id={`${idPrefix}-${idx}`}
              type="button"
              onClick={() => onSelect(seed.prompt)}
              className={`group relative flex w-[200px] shrink-0 cursor-pointer flex-col gap-1
                rounded-lg border p-3 text-left transition-colors
                ${isComplete
                  ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 hover:bg-emerald-500/10'
                  : isPartial
                    ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/10'
                    : 'border-border-soft bg-surface hover:border-border-subtle hover:bg-state-hover'
                }`}
              style={{ scrollSnapAlign: 'start' }}
            >
              {/* Status badge */}
              {isComplete && (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center
                  rounded-full bg-emerald-500 text-white">
                  <CheckIcon />
                </span>
              )}
              {isPartial && (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center
                  rounded-full bg-amber-500 text-white">
                  <HalfCircleIcon />
                </span>
              )}
              <span className="pr-6 text-sm font-medium text-text-primary">{seed.label}</span>
              <span className="line-clamp-2 text-xs leading-snug text-text-tertiary">
                {seed.prompt}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
