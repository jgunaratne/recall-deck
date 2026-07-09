'use client';

import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import Message from './Message';
import QuizTakeover from './QuizTakeover';
import Sidebar from './Sidebar';
import { splitIntoCards } from '@/lib/cards';
import { computeMastery, type MasteryLevel, type TopicMastery } from '@/lib/mastery';
import { pickTopics, type Topic } from '@/lib/topics';
import { READING_LEVELS, type ReadingLevel } from '@/lib/prompts';
import {
  type ChatMessage,
  type Conversation,
  conversationTitle,
  deleteConversation,
  getHistoryServerSnapshot,
  getHistorySnapshot,
  newConversationId,
  subscribeHistory,
  updateConversation,
  upsertConversation,
} from '@/lib/history';


function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function SparkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2c.6 4.8 1.9 7.4 4 9 1.5 1.1 3.4 1.7 6 2-2.6.3-4.5.9-6 2-2.1 1.6-3.4 4.2-4 9-.6-4.8-1.9-7.4-4-9-1.5-1.1-3.4-1.7-6-2 2.6-.3 4.5-.9 6-2 2.1-1.6 3.4-4.2 4-9z" />
    </svg>
  );
}

type QuizSource = {
  question: string;
  cards: string[];
};

type MasteryNote = {
  before: MasteryLevel;
  after: TopicMastery;
};

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [provider, setProvider] = useState('gemini');
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>('high');
  const [showQuizButton, setShowQuizButton] = useState(false);
  const [quizSource, setQuizSource] = useState<QuizSource | null>(null);
  const [masteryNote, setMasteryNote] = useState<MasteryNote | null>(null);
  // Latest quiz question, streamed to the voice tutor's context window.
  const [quizContext, setQuizContext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Snapshot of the last failed exchange so the error banner can offer Retry.
  const [retrySnapshot, setRetrySnapshot] = useState<{
    messages: ChatMessage[];
    convId: string;
  } | null>(null);
  const [visibleTopics, setVisibleTopics] = useState<Topic[]>([]);

  // Conversation history (localStorage-backed external store)
  const conversations = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot,
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messageCountRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoStartQuizRef = useRef(false);

  useEffect(() => {
    fetch('/api/providers')
      .then((res) => res.json())
      .then((data) => {
        if (data.providers && data.providers.length > 0) {
          setAvailableProviders(data.providers);
          const saved = localStorage.getItem('recalldeck_provider');
          if (saved && data.providers.includes(saved)) {
            setProvider(saved);
          } else {
            const defaultProv = data.providers.includes('gemini') ? 'gemini' : data.providers[0];
            setProvider(defaultProv);
          }
        }
      })
      .catch((err) => console.error('Failed to load providers:', err));
  }, []);

  // Restore saved reading level + pick topics after mount (deferred so
  // hydration renders the same stable default the server did).
  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = localStorage.getItem('recalldeck_reading_level') as ReadingLevel | null;
      if (saved && READING_LEVELS.includes(saved)) {
        setReadingLevel(saved);
        setVisibleTopics(pickTopics(saved));
      } else {
        setVisibleTopics(pickTopics('high'));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    localStorage.setItem('recalldeck_provider', newProvider);
  };

  const handleReadingLevelChange = (level: ReadingLevel) => {
    setReadingLevel(level);
    localStorage.setItem('recalldeck_reading_level', level);
    setVisibleTopics(pickTopics(level));
  };

  // Auto-scroll: always on a newly sent/received message, but during
  // streaming only follow if the reader is already near the bottom —
  // never yank them away from what they're reading.
  useEffect(() => {
    const isNewMessage = messages.length !== messageCountRef.current;
    messageCountRef.current = messages.length;

    const el = scrollAreaRef.current;
    const nearBottom = el
      ? el.scrollHeight - el.scrollTop - el.clientHeight < 150
      : true;

    if (isNewMessage || nearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: isNewMessage ? 'smooth' : 'auto' });
    }
  }, [messages]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };

  // Send message
  // Stream one assistant reply for an already-recorded user turn. Kept
  // separate from sendMessage so a failed exchange can be retried verbatim.
  const runExchange = async (newMessages: ChatMessage[], convId: string) => {
    setIsStreaming(true);
    setShowQuizButton(false);
    setError(null);
    setRetrySnapshot(null);

    // Add empty assistant message for streaming
    const assistantMessage: ChatMessage = { role: 'assistant', content: '' };
    setMessages([...newMessages, assistantMessage]);

    const userMessage = newMessages[newMessages.length - 1];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          provider,
          readingLevel,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to send message');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

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
                fullResponse += parsed.text;
                setMessages([
                  ...newMessages,
                  { role: 'assistant', content: fullResponse },
                ]);
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error);
              }
            } catch (parseError) {
              if (parseError instanceof Error && parseError.message !== 'Unexpected token') {
                throw parseError;
              }
            }
          }
        }
      }

      // Persist the completed exchange.
      if (fullResponse) {
        updateConversation(convId, (c) => ({
          ...c,
          messages: [...newMessages, { role: 'assistant', content: fullResponse }],
          updatedAt: Date.now(),
        }));
      }

      if (fullResponse.length > 100) {
        setShowQuizButton(true);
      }

      if (autoStartQuizRef.current && fullResponse) {
        autoStartQuizRef.current = false;
        startQuizForMessage(userMessage.content, fullResponse);
      }
    } catch (err) {
      autoStartQuizRef.current = false;
      setError(err instanceof Error ? err.message : 'Failed to get response');
      setRetrySnapshot({ messages: newMessages, convId });
      setMessages(newMessages);
    } finally {
      setIsStreaming(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isStreaming) return;

    const userMessage: ChatMessage = { role: 'user', content: content.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');

    // Create or update the conversation record for this turn.
    let convId = activeId;
    if (!convId) {
      convId = newConversationId();
      setActiveId(convId);
      const now = Date.now();
      upsertConversation({
        id: convId,
        title: conversationTitle(userMessage.content),
        messages: newMessages,
        quizzes: [],
        createdAt: now,
        updatedAt: now,
      });
    } else {
      updateConversation(convId, (c) => ({
        ...c,
        messages: newMessages,
        updatedAt: Date.now(),
      }));
    }

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    await runExchange(newMessages, convId);
  };

  const handleRetry = () => {
    if (!retrySnapshot || isStreaming) return;
    runExchange(retrySnapshot.messages, retrySnapshot.convId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startQuizForMessage = (userQuestion: string, assistantContent: string) => {
    setQuizSource({
      question: userQuestion,
      cards: splitIntoCards(assistantContent),
    });
    setMasteryNote(null);
    setQuizContext(null);
    setShowQuizButton(false);
  };

  // Launch a quiz grounded in the lecture cards of the latest answer.
  const handleQuizMe = () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastAssistant) return;
    startQuizForMessage(lastUser?.content ?? '', lastAssistant.content);
  };

  const handleQuizComplete = (score: number, total: number) => {
    if (!activeId) return;
    const existing = conversations.find((c) => c.id === activeId);
    updateConversation(activeId, (c) => ({
      ...c,
      quizzes: [...c.quizzes, { score, total, takenAt: Date.now() }],
      updatedAt: Date.now(),
    }));
    // Snapshot mastery before/after this quiz so the scorecard can show
    // topic development (and celebrate level-ups).
    if (existing) {
      const updated: Conversation = {
        ...existing,
        quizzes: [...existing.quizzes, { score, total, takenAt: Date.now() }],
      };
      setMasteryNote({
        before: computeMastery(existing).level,
        after: computeMastery(updated),
      });
    }
  };

  const handleQuizClose = () => {
    setQuizSource(null);
    setMessages([]);
    setActiveId(null);
    setShowQuizButton(false);
    setQuizContext(null);
    setError(null);
  };

  const handleQuizDismiss = () => {
    setQuizSource(null);
    setQuizContext(null);
    setError(null);
  };

  const handleQuizGoDeeper = () => {
    const topic = quizSource?.question ?? 'the previous topic';
    setQuizSource(null);
    setError(null);
    setActiveId(null);
    setMessages([]);
    autoStartQuizRef.current = true;
    sendMessage(`Go deeper on the topic: "${topic}". Please explain the advanced concepts, subtleties, and edge cases in more detail.`);
  };

  const handleNewChat = () => {
    if (isStreaming) return;
    setQuizSource(null);
    setQuizContext(null);
    setMessages([]);
    setActiveId(null);
    setShowQuizButton(false);
    setError(null);
    setSidebarOpen(false);
  };

  const handleSelectConversation = (conversation: Conversation) => {
    if (isStreaming) return;
    setMessages(conversation.messages);
    setActiveId(conversation.id);
    const last = conversation.messages[conversation.messages.length - 1];
    setShowQuizButton(!!last && last.role === 'assistant' && last.content.length > 100);
    setError(null);
    setSidebarOpen(false);
  };

  const handleDeleteConversation = (id: string) => {
    if (isStreaming) return;
    deleteConversation(id);
    if (id === activeId) {
      handleNewChat();
    }
  };

  const isEmpty = messages.length === 0;

  const inputCard = (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col rounded-lg bg-surface shadow-input"
    >
      <div className="m-3.5 flex flex-col gap-3">
        <textarea
          ref={inputRef}
          id="chat-input"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to learn?"
          rows={1}
          disabled={isStreaming}
          className="max-h-40 min-h-12 w-full resize-none bg-transparent pl-1.5 pt-1.5
            font-text text-base leading-[1.4] text-text-primary
            placeholder:text-text-tertiary focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="pl-1.5 text-xs text-text-tertiary">
            Chat with your tutor, then take a pop quiz
          </span>
          <button
            id="send-btn"
            type="submit"
            disabled={!input.trim() || isStreaming}
            aria-label="Send message"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md
              bg-accent-strong text-white transition-opacity hover:opacity-90
              disabled:pointer-events-none disabled:opacity-50"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </form>
  );

  const errorBanner = error && (
    <div
      role="alert"
      className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger/5 px-4 py-2.5"
    >
      <span className="text-sm text-danger">{error}</span>
      <span className="flex shrink-0 items-center gap-3">
        {retrySnapshot && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={isStreaming}
            className="cursor-pointer rounded-md border border-danger/30 px-2.5 py-1 text-xs
              font-medium text-danger transition-colors hover:bg-danger/10
              disabled:pointer-events-none disabled:opacity-50"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setRetrySnapshot(null);
          }}
          aria-label="Dismiss error"
          className="cursor-pointer text-xs text-danger/70 underline transition-colors hover:text-danger"
        >
          Dismiss
        </button>
      </span>
    </div>
  );

  return (
    <>
      <div className="flex h-dvh bg-page">
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          open={sidebarOpen}
          providers={availableProviders}
          provider={provider}
          readingLevel={readingLevel}
          onClose={() => setSidebarOpen(false)}
          onNewChat={handleNewChat}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
          onProviderChange={handleProviderChange}
          onReadingLevelChange={handleReadingLevelChange}
        />

        <div
          className="flex h-dvh min-w-0 flex-1 flex-col"
        >
          {/* Header */}
          <header className="sticky top-0 z-20 flex h-[var(--header-height)] shrink-0 items-center justify-between bg-page px-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md
                  text-text-secondary transition-colors hover:bg-state-hover"
              >
                <MenuIcon />
              </button>
              <SparkMark className="h-4 w-4 text-accent" />
              <span className="font-serif text-lg text-text-primary">Recall Deck</span>
            </div>
            <span className="hidden text-xs text-text-tertiary sm:block">
              Active recall, one pop quiz at a time
            </span>
          </header>

          {isEmpty ? (
            /* Empty state — centered greeting, starters, and input */
            <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-16">
              <div
                className="inline-flex select-none items-center justify-center gap-3 font-serif text-[34px] font-light leading-[48px] text-text-secondary sm:text-[40px] sm:leading-[60px]"
                style={{ fontVariationSettings: '"opsz" 48' }}
              >
                <SparkMark className="h-7 w-7 text-accent sm:h-8 sm:w-8" />
                <span suppressHydrationWarning>{getTimeOfDay()}, learner</span>
              </div>

              <div className="w-full max-w-[var(--input-max-width)]">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleTopics.map((seed, idx) => (
                    <button
                      key={`${seed.label}-${idx}`}
                      id={`seed-prompt-${idx}`}
                      type="button"
                      onClick={() => sendMessage(seed.prompt)}
                      className="group flex cursor-pointer flex-col gap-1 rounded-lg border border-border-soft
                        bg-surface p-3 text-left transition-colors
                        hover:border-border-subtle hover:bg-state-hover"
                    >
                      <span className="text-sm font-medium text-text-primary">{seed.label}</span>
                      <span className="line-clamp-2 text-xs leading-snug text-text-tertiary">
                        {seed.prompt}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleTopics(pickTopics(readingLevel))}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border-soft
                      bg-surface px-4 py-1.5 text-xs font-medium text-text-secondary
                      transition-colors hover:border-border-subtle hover:bg-state-hover"
                  >
                    <RefreshIcon />
                    More topics
                  </button>
                </div>
              </div>

              <div className="w-full max-w-[var(--input-max-width)]">
                {errorBanner}
                {inputCard}
              </div>
            </main>
          ) : (
            <>
              {/* Messages */}
              <div ref={scrollAreaRef} className="scroll-area flex-1 overflow-y-auto">
                <div className="mx-auto max-w-[var(--content-max-width)] px-4 pb-6 sm:px-6">
                  {messages.map((msg, idx) => {
                    const isLast = idx === messages.length - 1;
                    // Derive topic from the first user message
                    const firstUserMsg = messages.find((m) => m.role === 'user');
                    return (
                      <Message
                        key={`${activeId ?? 'draft'}-${idx}`}
                        role={msg.role}
                        content={msg.content}
                        isStreaming={isStreaming}
                        isLastMessage={isLast}
                        showQuizButton={showQuizButton}
                        onQuizMe={handleQuizMe}
                        topic={firstUserMsg?.content}
                        readingLevel={readingLevel}
                        quizContext={quizContext}
                      />
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input area */}
              <div className="shrink-0 px-4 pb-4 sm:px-6">
                <div className="mx-auto max-w-[var(--input-max-width)]">
                  {errorBanner}
                  {inputCard}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quiz Takeover */}
      {quizSource && (
        <QuizTakeover
          question={quizSource.question}
          cards={quizSource.cards}
          provider={provider}
          readingLevel={readingLevel}
          mastery={masteryNote?.after ?? null}
          previousMasteryLevel={masteryNote?.before ?? null}
          onReturnToHome={handleQuizClose}
          onGoDeeper={handleQuizGoDeeper}
          onClose={handleQuizDismiss}
          onComplete={handleQuizComplete}
          onQuestionShown={setQuizContext}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
      )}
    </>
  );
}
