'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Message from './Message';
import QuizTakeover from './QuizTakeover';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SEED_PROMPTS = [
  {
    label: 'Grasp statistics',
    prompt: 'Explain confidence intervals in simple terms',
  },
  {
    label: 'Picture the math',
    prompt: 'What are vectors in geometry and how do they work?',
  },
  {
    label: 'Peek under the hood',
    prompt: 'Why do databases use B-Trees for indexing?',
  },
];

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  anthropic: 'Claude',
};

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

function SparkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2c.6 4.8 1.9 7.4 4 9 1.5 1.1 3.4 1.7 6 2-2.6.3-4.5.9-6 2-2.1 1.6-3.4 4.2-4 9-.6-4.8-1.9-7.4-4-9-1.5-1.1-3.4-1.7-6-2 2.6-.3 4.5-.9 6-2 2.1-1.6 3.4-4.2 4-9z" />
    </svg>
  );
}

type ProviderPickerProps = {
  providers: string[];
  value: string;
  onChange: (provider: string) => void;
};

function ProviderPicker({ providers, value, onChange }: ProviderPickerProps) {
  return (
    <div className="relative">
      <select
        id="provider-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Model provider"
        className="h-8 cursor-pointer appearance-none rounded-md bg-transparent pl-2.5 pr-7 text-sm
          text-text-secondary transition-colors hover:bg-state-hover focus:outline-none"
      >
        {providers.map((p) => (
          <option key={p} value={p}>
            {PROVIDER_LABELS[p] ?? p}
          </option>
        ))}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [provider, setProvider] = useState('gemini');
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [showQuizButton, setShowQuizButton] = useState(false);
  const [quizTranscript, setQuizTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    localStorage.setItem('recalldeck_provider', newProvider);
  };

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };

  // Send message
  const sendMessage = async (content: string) => {
    if (!content.trim() || isStreaming) return;

    const userMessage: ChatMessage = { role: 'user', content: content.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);
    setShowQuizButton(false);
    setError(null);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Add empty assistant message for streaming
    const assistantMessage: ChatMessage = { role: 'assistant', content: '' };
    setMessages([...newMessages, assistantMessage]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          provider,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
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

      if (fullResponse.length > 100) {
        setShowQuizButton(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response');
      setMessages(newMessages);
    } finally {
      setIsStreaming(false);
    }
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

  // Get the transcript for quiz generation (last assistant message + context)
  const getQuizTranscript = (): string => {
    const lastMessages = messages.slice(-2);
    return lastMessages
      .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
      .join('\n\n');
  };

  const handleQuizMe = () => {
    setQuizTranscript(getQuizTranscript());
    setShowQuizButton(false);
  };

  const handleQuizClose = () => {
    setQuizTranscript(null);
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
          <div className="flex items-center gap-2">
            {availableProviders.length > 1 && (
              <ProviderPicker
                providers={availableProviders}
                value={provider}
                onChange={handleProviderChange}
              />
            )}
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
      </div>
    </form>
  );

  const errorBanner = error && (
    <div
      role="alert"
      className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger/5 px-4 py-2.5"
    >
      <span className="text-sm text-danger">{error}</span>
      <button
        type="button"
        onClick={() => setError(null)}
        aria-label="Dismiss error"
        className="shrink-0 cursor-pointer text-xs text-danger/70 underline transition-colors hover:text-danger"
      >
        Dismiss
      </button>
    </div>
  );

  return (
    <>
      <div className="flex h-dvh flex-1 flex-col bg-page">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-[var(--header-height)] shrink-0 items-center justify-between bg-page px-4">
          <div className="flex items-center gap-2 px-2">
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

            <div className="grid w-full max-w-[var(--input-max-width)] grid-cols-1 gap-2 sm:grid-cols-3">
              {SEED_PROMPTS.map((seed, idx) => (
                <button
                  key={idx}
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

            <div className="w-full max-w-[var(--input-max-width)]">
              {errorBanner}
              {inputCard}
            </div>
          </main>
        ) : (
          <>
            {/* Messages */}
            <div className="scroll-area flex-1 overflow-y-auto">
              <div className="mx-auto max-w-[var(--content-max-width)] px-4 pb-6 sm:px-6">
                {messages.map((msg, idx) => {
                  const isLast = idx === messages.length - 1;
                  return (
                    <Message
                      key={idx}
                      role={msg.role}
                      content={msg.content}
                      isStreaming={isStreaming}
                      isLastMessage={isLast}
                      showQuizButton={showQuizButton}
                      onQuizMe={handleQuizMe}
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

      {/* Quiz Takeover */}
      {quizTranscript && (
        <QuizTakeover
          transcript={quizTranscript}
          provider={provider}
          onClose={handleQuizClose}
        />
      )}
    </>
  );
}
