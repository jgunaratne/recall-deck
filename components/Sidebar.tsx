'use client';

import React, { useState } from 'react';
import type { Conversation } from '@/lib/history';

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  anthropic: 'Claude',
};

const ALL_PROVIDERS = ['gemini', 'anthropic'];

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
};

function SidebarItem({ conversation, active, onSelect, onDelete }: SidebarItemProps) {
  const [expanded, setExpanded] = useState(false);

  // The title is the first question; children are follow-up questions + quizzes.
  const followUps = conversation.messages
    .filter((m) => m.role === 'user')
    .slice(1)
    .map((m) => m.content.trim().split('\n')[0]);
  const hasChildren = followUps.length > 0 || conversation.quizzes.length > 0;

  return (
    <li className="group/item relative flex flex-col">
      <div className="relative flex items-center">
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
  collapsed: boolean;
  mobileOpen: boolean;
  providers: string[];
  provider: string;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onNewChat: () => void;
  onSelect: (conversation: Conversation) => void;
  onDelete: (id: string) => void;
  onProviderChange: (provider: string) => void;
};

export default function Sidebar({
  conversations,
  activeId,
  collapsed,
  mobileOpen,
  providers,
  provider,
  onToggleCollapse,
  onCloseMobile,
  onNewChat,
  onSelect,
  onDelete,
  onProviderChange,
}: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <nav
        aria-label="Sidebar"
        data-collapsed={collapsed || undefined}
        className={`group/sidebar fixed left-0 top-0 z-40 flex h-dvh w-[var(--sidebar-width)] flex-col
          border-r-[0.5px] border-border-subtle bg-page
          bg-gradient-to-t from-[rgba(245,244,237,0.05)] to-[rgba(245,244,237,0.3)]
          transition-transform duration-200
          md:transition-[width] md:duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:data-[collapsed]:w-[var(--sidebar-width-collapsed)]`}
      >
        {/* Header: wordmark + collapse toggle */}
        <div className="flex w-full items-center justify-between p-2">
          <span className="flex h-8 items-center gap-2 overflow-hidden whitespace-nowrap pl-2 font-serif text-lg text-text-primary group-data-[collapsed]/sidebar:md:hidden">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden>
              <path d="M12 2c.6 4.8 1.9 7.4 4 9 1.5 1.1 3.4 1.7 6 2-2.6.3-4.5.9-6 2-2.1 1.6-3.4 4.2-4 9-.6-4.8-1.9-7.4-4-9-1.5-1.1-3.4-1.7-6-2 2.6-.3 4.5-.9 6-2 2.1-1.6 3.4-4.2 4-9z" />
            </svg>
            Recall Deck
          </span>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
            className="hidden h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md
              text-text-secondary transition-colors hover:bg-state-hover md:flex"
          >
            <PanelLeftIcon />
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md
              text-text-secondary transition-colors hover:bg-state-hover md:hidden"
          >
            <PanelLeftIcon />
          </button>
        </div>

        {/* New chat */}
        <div className="flex flex-col gap-px px-2 pt-2">
          <button
            type="button"
            onClick={onNewChat}
            title="New chat"
            className="flex h-8 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm text-text-secondary
              transition-colors hover:bg-state-hover
              group-data-[collapsed]/sidebar:md:w-8 group-data-[collapsed]/sidebar:md:justify-center group-data-[collapsed]/sidebar:md:px-0"
          >
            <span className="text-text-primary"><PlusIcon /></span>
            <span className="grow truncate text-left leading-5 group-data-[collapsed]/sidebar:md:hidden">New chat</span>
          </button>
        </div>

        {/* Recents */}
        <div className="mt-5 flex grow flex-col overflow-y-auto px-2 group-data-[collapsed]/sidebar:md:hidden">
          {conversations.length > 0 ? (
            <>
              <div className="truncate px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.5px] text-text-tertiary">
                Recents
              </div>
              <ul className="m-0 flex list-none flex-col gap-px p-0">
                {conversations.map((c) => (
                  <SidebarItem
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    onSelect={() => onSelect(c)}
                    onDelete={() => onDelete(c.id)}
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

        {/* Settings: engine picker */}
        {providers.length > 0 && (
          <div className="border-t-[0.5px] border-border-subtle p-3 group-data-[collapsed]/sidebar:md:hidden">
            <div className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.5px] text-text-tertiary">
              Engine
            </div>
            <div className="flex rounded-md bg-state-hover p-0.5" role="radiogroup" aria-label="Model engine">
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
      </nav>
    </>
  );
}
