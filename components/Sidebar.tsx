'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Conversation } from '@/lib/history';
import {
  computeMastery,
  MASTERY_FILL_CLASS,
  MASTERY_LABELS,
  MASTERY_TEXT_CLASS,
  type TopicMastery,
} from '@/lib/mastery';
import { READING_LEVELS, READING_LEVEL_LABELS, type ReadingLevel } from '@/lib/prompts';

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  anthropic: 'Claude',
};

const ALL_PROVIDERS = ['anthropic', 'gemini'];

const SLIDER_THUMB_CLASSES =
  '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent ' +
  '[&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full ' +
  '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[var(--color-accent)] ' +
  '[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-shadow hover:[&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(217,119,87,0.15)] ' +
  '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent ' +
  '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full ' +
  '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[var(--color-accent)] ' +
  '[&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:transition-shadow hover:[&::-moz-range-thumb]:shadow-[0_0_0_4px_rgba(217,119,87,0.15)]';

function ReadingLevelSlider({
  value,
  onChange,
}: {
  value: ReadingLevel;
  onChange: (level: ReadingLevel) => void;
}) {
  const index = Math.max(0, READING_LEVELS.indexOf(value));
  const percent = (index / (READING_LEVELS.length - 1)) * 100;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-text-tertiary">
          Education level
        </span>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
          {READING_LEVEL_LABELS[value]}
        </span>
      </div>
      <div className="relative px-1 py-2">
        {/* Track */}
        <div className="pointer-events-none absolute left-1 right-1 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border-subtle">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-accent/60 transition-all duration-75"
            style={{ width: `${percent}%` }}
          />
        </div>
        {/* Notches */}
        <div className="pointer-events-none absolute left-[6px] right-[6px] top-1/2 flex -translate-y-1/2 justify-between">
          {READING_LEVELS.map((_, i) => (
            <span
              key={i}
              className={`h-1 w-1 rounded-full transition-colors ${
                index >= i ? 'bg-accent/40' : 'bg-border-subtle'
              }`}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={READING_LEVELS.length - 1}
          step={1}
          value={index}
          onChange={(e) => onChange(READING_LEVELS[parseInt(e.target.value, 10)])}
          aria-label="Education level"
          aria-valuetext={READING_LEVEL_LABELS[value]}
          className={`relative z-10 block w-full cursor-pointer appearance-none bg-transparent ${SLIDER_THUMB_CLASSES}`}
        />
      </div>
      <div className="flex justify-between px-1 text-[10px] uppercase tracking-wider text-text-tertiary">
        <span>Elementary</span>
        <span>University</span>
      </div>
    </div>
  );
}

function PanelLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function GraduationCapIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </svg>
  );
}

function CircleCheckIcon({ className }: { className?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/**
 * LeetCode-style topic status: green check when mastered, otherwise a
 * progress ring that fills as quiz accuracy improves.
 */
function MasteryIndicator({ mastery }: { mastery: TopicMastery }) {
  if (mastery.level === 'mastered') {
    return <CircleCheckIcon className="text-emerald-600" />;
  }
  const r = 5.5;
  const circumference = 2 * Math.PI * r;
  const ringTone =
    mastery.level === 'proficient'
      ? 'text-emerald-500'
      : mastery.level === 'developing'
        ? 'text-amber-500'
        : 'text-accent';
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" className={`-rotate-90 ${ringTone}`}>
      <circle cx="7.5" cy="7.5" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      {mastery.score > 0 && (
        <circle
          cx="7.5"
          cy="7.5"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.5, mastery.score * circumference)} ${circumference}`}
          className="transition-all duration-500"
        />
      )}
    </svg>
  );
}

/** Filled pips for study depth — each deep dive adds one. */
function DepthPips({ depth }: { depth: number }) {
  const shown = Math.min(depth, 4);
  return (
    <span className="flex items-center gap-[3px]" title={`Depth ${depth} — each deep dive adds a level`}>
      {Array.from({ length: 4 }).map((_, i) => (
        <span
          key={i}
          className={`h-1 w-1 rounded-full ${i < shown ? 'bg-accent/70' : 'bg-border-subtle'}`}
        />
      ))}
      {depth > 4 && <span className="text-[10px] text-text-tertiary">+{depth - 4}</span>}
    </span>
  );
}

/** Lexia-style development panel shown when a topic row is expanded. */
function MasteryPanel({ mastery }: { mastery: TopicMastery }) {
  return (
    <div className="mx-2 mb-1 flex flex-col gap-1.5 rounded-md border border-border-soft bg-surface p-2">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-semibold ${MASTERY_TEXT_CLASS[mastery.level]}`}>
          {MASTERY_LABELS[mastery.level]}
          {mastery.trend === 'improving' && ' ↑'}
          {mastery.trend === 'slipping' && ' ↓'}
        </span>
        {mastery.accuracy !== null && (
          <span className="text-[11px] tabular-nums text-text-tertiary">
            {Math.round(mastery.accuracy * 100)}%
          </span>
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-border-subtle">
        <div
          className={`h-full rounded-full transition-all duration-500 ${MASTERY_FILL_CLASS[mastery.level]}`}
          style={{ width: `${Math.round(mastery.score * 100)}%` }}
        />
      </div>
      <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
        <DepthPips depth={mastery.depth} />
        <span>
          {mastery.cardsStudied} card{mastery.cardsStudied === 1 ? '' : 's'} ·{' '}
          {mastery.quizzesTaken} quiz{mastery.quizzesTaken === 1 ? '' : 'zes'}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-text-secondary">{mastery.feedback}</p>
    </div>
  );
}

function quizTone(score: number, total: number): string {
  if (score === total) return 'text-emerald-700';
  if (score === 0) return 'text-rose-700';
  return 'text-amber-700';
}

type SidebarItemProps = {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

function SidebarItem({ conversation, active, onSelect, onDelete, onContextMenu }: SidebarItemProps) {
  const [expanded, setExpanded] = useState(false);
  const mastery = useMemo(() => computeMastery(conversation), [conversation]);

  // The title is the first question; children are follow-up questions + quizzes.
  const followUps = conversation.messages
    .filter((m) => m.role === 'user')
    .slice(1)
    .map((m) => m.content.trim().split('\n')[0]);
  const hasChildren =
    followUps.length > 0 || conversation.quizzes.length > 0 || mastery.level !== 'not-started';

  return (
    <li className="group/item relative flex flex-col">
      <div className="relative flex items-center" onContextMenu={onContextMenu}>
        {hasChildren && (
          <button
            type="button"
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
            onClick={() => setExpanded((x) => !x)}
            className="absolute left-0 top-1 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm
              text-text-tertiary transition-colors hover:bg-state-hover"
          >
            <ChevronRightIcon className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
          </button>
        )}
        <button
          type="button"
          onClick={onSelect}
          data-active={active || undefined}
          title={conversation.title}
          className={`flex h-8 w-full cursor-pointer items-center rounded-sm px-2 pr-8 text-left text-sm
            text-text-secondary transition-colors hover:bg-state-hover-soft data-[active]:bg-state-active
            ${hasChildren ? 'pl-7' : ''}`}
        >
          <span className="grow truncate leading-5">{conversation.title}</span>
        </button>
        {mastery.level !== 'not-started' && (
          <span
            aria-label={`${MASTERY_LABELS[mastery.level]} — ${mastery.feedback}`}
            className="pointer-events-none absolute right-2 top-2 flex items-center transition-opacity
              group-hover/item:opacity-0 group-focus-within/item:opacity-0"
          >
            <MasteryIndicator mastery={mastery} />
          </span>
        )}
        <button
          type="button"
          aria-label="Delete conversation"
          onClick={onDelete}
          className="absolute right-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm
            text-text-tertiary opacity-0 transition-opacity hover:bg-state-hover hover:text-danger
            focus-visible:opacity-100 group-hover/item:opacity-100"
        >
          <TrashIcon />
        </button>
      </div>

      {expanded && hasChildren && (
        <ul className="m-0 flex list-none flex-col gap-px p-0 pl-7">
          <li key="mastery">
            <MasteryPanel mastery={mastery} />
          </li>
          {followUps.map((q, i) => (
            <li key={`q-${i}`}>
              <button
                type="button"
                onClick={onSelect}
                title={q}
                className="flex h-7 w-full cursor-pointer items-center rounded-sm px-2 text-left text-xs
                  text-text-tertiary transition-colors hover:bg-state-hover-soft"
              >
                <span className="truncate leading-5">{q}</span>
              </button>
            </li>
          ))}
          {conversation.quizzes.map((quiz, i) => (
            <li key={`quiz-${i}`}>
              <div className="flex h-7 items-center gap-2 px-2 text-xs text-text-tertiary">
                <GraduationCapIcon />
                <span className="truncate">Pop quiz</span>
                <span className={`ml-auto font-medium tabular-nums ${quizTone(quiz.score, quiz.total)}`}>
                  {quiz.score}/{quiz.total}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

type SidebarProps = {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  providers: string[];
  provider: string;
  readingLevel: ReadingLevel;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (conversation: Conversation) => void;
  onDelete: (id: string) => void;
  onProviderChange: (provider: string) => void;
  onReadingLevelChange: (level: ReadingLevel) => void;
};

export default function Sidebar({
  conversations,
  activeId,
  open,
  providers,
  provider,
  readingLevel,
  onClose,
  onNewChat,
  onSelect,
  onDelete,
  onProviderChange,
  onReadingLevelChange,
}: SidebarProps) {
  const masteredCount = useMemo(
    () => conversations.filter((c) => computeMastery(c).level === 'mastered').length,
    [conversations],
  );

  // Right-click context menu on a history item.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/20"
          onClick={onClose}
          aria-hidden
        />
      )}

      <nav
        aria-label="Sidebar"
        className={`group/sidebar fixed left-0 top-0 z-[70] flex h-dvh w-[var(--sidebar-width)] flex-col
          border-r-[0.5px] border-border-subtle bg-page
          bg-gradient-to-t from-[rgba(245,244,237,0.05)] to-[rgba(245,244,237,0.3)]
          transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Header: wordmark + close toggle */}
        <div className="flex w-full items-center justify-between p-2">
          <span className="flex h-8 items-center gap-2 overflow-hidden whitespace-nowrap pl-2 font-serif text-lg text-text-primary">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden>
              <path d="M12 2c.6 4.8 1.9 7.4 4 9 1.5 1.1 3.4 1.7 6 2-2.6.3-4.5.9-6 2-2.1 1.6-3.4 4.2-4 9-.6-4.8-1.9-7.4-4-9-1.5-1.1-3.4-1.7-6-2 2.6-.3 4.5-.9 6-2 2.1-1.6 3.4-4.2 4-9z" />
            </svg>
            Recall Tutor
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md
              text-text-secondary transition-colors hover:bg-state-hover"
          >
            <PanelLeftIcon />
          </button>
        </div>

        {/* New topic */}
        <div className="flex flex-col gap-px px-2 pt-2">
          <button
            type="button"
            onClick={onNewChat}
            title="New topic"
            className="flex h-8 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm text-text-secondary
              transition-colors hover:bg-state-hover"
          >
            <span className="text-text-primary"><PlusIcon /></span>
            <span className="grow truncate text-left leading-5">New topic</span>
          </button>
        </div>

        {/* Recents */}
        <div className="mt-5 flex grow flex-col overflow-y-auto px-2">
          {conversations.length > 0 ? (
            <>
              <div className="flex items-center justify-between px-2 pb-1.5">
                <span className="truncate text-[11px] font-medium uppercase tracking-[0.5px] text-text-tertiary">
                  Recents
                </span>
                {masteredCount > 0 && (
                  <span
                    className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-emerald-700"
                    title={`${masteredCount} of ${conversations.length} topics mastered`}
                  >
                    <CircleCheckIcon className="h-3 w-3" />
                    {masteredCount}/{conversations.length}
                  </span>
                )}
              </div>
              <ul className="m-0 flex list-none flex-col gap-px p-0">
                {conversations.map((c) => (
                  <SidebarItem
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    onSelect={() => onSelect(c)}
                    onDelete={() => onDelete(c.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, id: c.id });
                    }}
                  />
                ))}
              </ul>
            </>
          ) : (
            <p className="px-2 text-xs leading-relaxed text-text-tertiary">
              Your questions and quiz results will appear here.
            </p>
          )}
        </div>

        {/* Settings: reading level + model */}
        <div className="flex flex-col gap-4 border-t-[0.5px] border-border-subtle p-3">
          <ReadingLevelSlider value={readingLevel} onChange={onReadingLevelChange} />

          {providers.length > 0 && (
            <div>
              <div className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.5px] text-text-tertiary">
                Model
              </div>
            <div className="flex rounded-md bg-state-hover p-0.5" role="radiogroup" aria-label="Model selection">
              {ALL_PROVIDERS.map((p) => {
                const available = providers.includes(p);
                const selected = provider === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!available}
                    title={available ? undefined : 'API key not configured'}
                    onClick={() => onProviderChange(p)}
                    className={`h-7 flex-1 cursor-pointer rounded-[5px] text-xs font-medium transition-colors
                      disabled:cursor-not-allowed disabled:opacity-40
                      ${selected ? 'bg-surface text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
                  >
                    {PROVIDER_LABELS[p]}
                  </button>
                );
              })}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Right-click context menu for history items */}
      {contextMenu &&
        createPortal(
          <div
            className="fixed inset-0 z-[90]"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          >
            <div
              role="menu"
              className="absolute min-w-[160px] rounded-md border border-border-soft bg-surface py-1 shadow-lg"
              style={{
                left: Math.min(contextMenu.x, window.innerWidth - 176),
                top: Math.min(contextMenu.y, window.innerHeight - 48),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onDelete(contextMenu.id);
                  setContextMenu(null);
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm
                  text-danger transition-colors hover:bg-state-hover"
              >
                <TrashIcon />
                Delete topic
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
