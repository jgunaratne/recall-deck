'use client';

import { Atom, BookOpenText, BriefcaseBusiness, ChartNoAxesCombined, CheckCircle2, CircleDashed, Cpu, RotateCw, UsersRound } from 'lucide-react';
import { TOPIC_CATEGORY_LABELS, type Topic, type TopicCategory } from '@/lib/topics';

type TopicStatusMap = Map<string, 'partial' | 'complete'>;

const CATEGORY_ICONS = {
  science: Atom,
  humanities: BookOpenText,
  'social-science': UsersRound,
  business: ChartNoAxesCombined,
  technology: Cpu,
  careers: BriefcaseBusiness,
} as const;

type TopicGridProps = {
  category: TopicCategory;
  topics: Topic[];
  topicStatus: TopicStatusMap;
  onSelect: (prompt: string) => void;
  onLoadMore: () => void;
};

const PLACEHOLDER_WIDTHS = ['w-24', 'w-32', 'w-28', 'w-20', 'w-36'];

export default function TopicGrid({ category, topics, topicStatus, onSelect, onLoadMore }: TopicGridProps) {
  const Icon = CATEGORY_ICONS[category];
  const isLoading = topics.length === 0;

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-border-soft" />
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary">
          <Icon size={14} strokeWidth={1.9} aria-hidden />
          <span>{TOPIC_CATEGORY_LABELS[category]}</span>
        </div>
        <div className="h-px flex-1 bg-border-soft" />
      </div>

      <div className="flex flex-wrap gap-2" aria-busy={isLoading}>
        {isLoading ? (
          PLACEHOLDER_WIDTHS.map((width, index) => (
            <div
              key={`${category}-${width}`}
              aria-hidden
              className={`relative h-10 ${width} overflow-hidden rounded-full border border-border-soft bg-surface`}
            >
              <div
                className="image-shimmer absolute inset-y-0 w-2/5 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.78),transparent)]"
                style={{ animationDelay: `${index * 120}ms` }}
              />
            </div>
          ))
        ) : (
          <>
            {topics.map((topic) => {
              const status = topicStatus.get(topic.prompt);
              return (
                <button
                  key={topic.prompt}
                  type="button"
                  onClick={() => onSelect(topic.prompt)}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border-soft bg-surface px-3.5 py-2 text-left text-sm text-text-primary shadow-sm transition-colors hover:bg-state-hover"
                >
                  {status === 'complete' && <CheckCircle2 size={14} className="text-emerald-600" aria-hidden />}
                  {status === 'partial' && <CircleDashed size={14} className="text-amber-600" aria-hidden />}
                  <span>{topic.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={onLoadMore}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border-soft bg-surface px-3.5 py-2 text-sm text-text-tertiary shadow-sm transition-colors hover:bg-state-hover hover:text-text-primary"
            >
              <RotateCw size={14} aria-hidden />
              <span>More</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}
