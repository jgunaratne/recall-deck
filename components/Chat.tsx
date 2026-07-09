'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Message from './Message';
import QuizTakeover from './QuizTakeover';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SEED_PROMPTS = [
  'Explain confidence intervals in simple terms',
  'What are vectors in geometry and how do they work?',
  'Why do databases use B-Trees for indexing?',
];

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
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
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

  return (
    <>
      <div className="flex-1 flex flex-col h-dvh bg-page">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border-soft bg-page">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎓</span>
            <span className="text-text-primary font-semibold text-base">Recall Deck</span>
          </div>
          {availableProviders.length > 1 ? (
            <div className="flex items-center gap-1.5 bg-state-hover border border-border-subtle rounded-lg px-2 py-1 text-xs">
              <span className="text-text-tertiary">Host:</span>
              <select
                id="provider-select"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="bg-transparent text-accent font-semibold focus:outline-none cursor-pointer"
              >
                <option value="gemini" className="bg-page text-text-primary">Gemini</option>
                <option value="anthropic" className="bg-page text-text-primary">Anthropic</option>
              </select>
            </div>
          ) : (
            <span className="text-text-tertiary text-xs">Active Recall Pop Quizzes</span>
          )}
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            // Empty state with seed prompts
            <div className="flex flex-col items-center justify-center h-full gap-6 px-4">
              <div className="text-center">
                <h1
                  className="text-3xl font-bold text-accent tracking-wider mb-2"
                  style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
                >
                  Recall Deck
                </h1>
                <p className="text-text-secondary text-sm max-w-[280px] leading-relaxed">
                  Discuss a topic with your AI tutor, then clear your desk for a pop quiz.
                </p>
              </div>

              <div className="flex flex-col gap-2 w-full max-w-sm">
                {SEED_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    id={`seed-prompt-${idx}`}
                    onClick={() => sendMessage(prompt)}
                    className="w-full px-4 py-3 bg-surface border border-border-subtle rounded-xl
                      text-text-secondary text-sm text-left
                      hover:bg-state-hover hover:border-accent/30
                      active:scale-[0.98] transition-all duration-200 shadow-sm cursor-pointer"
                    style={{ touchAction: 'manipulation' }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 border-t border-border-soft px-4 py-3 bg-page">
          <form onSubmit={handleSubmit} className="flex items-end gap-2 max-w-2xl mx-auto">
            <textarea
              ref={inputRef}
              id="chat-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask something you want to learn..."
              rows={1}
              className="flex-1 px-4 py-3 bg-surface border border-border-subtle rounded-xl
                text-text-primary placeholder-text-tertiary/50 text-sm
                focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20
                resize-none transition-all shadow-sm"
              disabled={isStreaming}
            />
            <button
              id="send-btn"
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center
                bg-accent text-surface rounded-xl
                hover:bg-accent-strong active:scale-90
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-200 shadow-md shadow-accent/15 cursor-pointer"
              style={{ touchAction: 'manipulation' }}
              aria-label="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
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
