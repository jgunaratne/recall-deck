'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ReadingLevel } from '@/lib/prompts';

// ── Types ────────────────────────────────────────────────────────────────────

type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface GeminiLiveOverlayProps {
  /** The user's topic query */
  topic: string;
  /** Current reading/education level */
  readingLevel: ReadingLevel;
  /** Whether the parent component is still streaming cards */
  isStreaming: boolean;
  /** Called with card content to queue for reading */
  currentCardContent: string | null;
  /** Quiz question text, if any, to inject as context */
  quizContext: string | null;
  /** Answer result text when the student answers a quiz question */
  answerResult: string | null;
  /** Final score text when the quiz ends, for a closing remark */
  quizResult: string | null;
  /** All card contents for full context */
  allCards: string[];
  /** Whether the quiz is currently active/open */
  isQuizActive?: boolean;
}

// ── Icons ────────────────────────────────────────────────────────────────────

function SpeakerOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

function MicOnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.49-.34 2.18" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function PulseRing({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="absolute inset-0 rounded-full animate-ping bg-accent/30" style={{ animationDuration: '1.5s' }} />
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function GeminiLiveOverlay({
  topic,
  readingLevel,
  isStreaming,
  currentCardContent,
  quizContext,
  answerResult,
  quizResult,
  allCards,
  isQuizActive,
}: GeminiLiveOverlayProps) {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // While the quiz takeover is open, the control bar teleports into its
  // header slot so the student can mute the tutor or ask a question mid-quiz.
  const [quizPortalEl, setQuizPortalEl] = useState<HTMLElement | null>(null);

  // Refs for the session, recorder, and player (lazy-loaded)
  const sessionRef = useRef<import('@/lib/gemini-live-session').GeminiLiveSession | null>(null);
  const recorderRef = useRef<import('@/lib/audio-recorder').AudioRecorder | null>(null);
  const playerRef = useRef<import('@/lib/audio-player').AudioPlayer | null>(null);
  // Mirror muted state in a ref so player callbacks avoid stale closures
  const mutedRef = useRef(false);
  // Cards streamed to the model as grounding context vs. cards the tutor has
  // been asked to read aloud — separate sets, because every card becomes
  // context as it streams in, but reading happens only when the student
  // flips to it.
  const sentCardsRef = useRef<Set<string>>(new Set());
  const readCardsRef = useRef<Set<string>>(new Set());
  const sentQuizRef = useRef<string | null>(null);
  const sentAnswerRef = useRef<string | null>(null);
  const sentQuizResultRef = useRef<string | null>(null);
  const hasKickedOffRef = useRef(false);
  // Synchronous connect guard — the `status` state is stale within a render
  // pass, so rapid effect re-runs (e.g. while cards stream in) would
  // otherwise open a second parallel session and orphan the first.
  const connectInFlightRef = useRef(false);
  // Monotonic attempt id — disconnect() bumps it so a connect whose config
  // fetch was still in flight (StrictMode remount, fast unmount) bails out
  // instead of opening an orphaned second session.
  const connectAttemptRef = useRef(0);

  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Connect to Gemini Live ─────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (connectInFlightRef.current) return;
    if (status === 'connecting' || status === 'connected') return;
    connectInFlightRef.current = true;
    const attempt = ++connectAttemptRef.current;

    setStatus('connecting');
    setError(null);

    try {
      // Fetch config from server (includes API key, voice, system instruction)
      const res = await fetch('/api/gemini-live/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, readingLevel }),
      });

      if (!res.ok) {
        throw new Error('Failed to get Gemini Live config');
      }

      const config = await res.json();

      // Lazy-load client-side modules
      const [{ GeminiLiveSession }, { AudioPlayer }] = await Promise.all([
        import('@/lib/gemini-live-session'),
        import('@/lib/audio-player'),
      ]);

      // A disconnect (or newer connect) superseded this attempt while we
      // were awaiting — abandon it rather than open an orphaned session.
      if (attempt !== connectAttemptRef.current) return;

      // Create audio player
      const player = new AudioPlayer();
      player.onPlaybackStart = () => {
        // Don't flip isSpeaking when muted — the icon should stay muted
        if (mountedRef.current && !mutedRef.current) setIsSpeaking(true);
      };
      player.onPlaybackEnd = () => {
        if (mountedRef.current) setIsSpeaking(false);
      };
      playerRef.current = player;

      // Create session
      const session = new GeminiLiveSession({
        onStatusChange: (s) => {
          if (s === 'error' || s === 'idle') {
            connectInFlightRef.current = false;
          }
          if (!mountedRef.current) return;
          setStatus(s);
          if (s === 'error') {
            setIsSpeaking(false);
          }
        },
        onAudioChunk: (base64Pcm) => {
          // Always enqueue audio — the player's own `muted` property
          // handles silencing so we avoid a stale-closure on isMuted.
          playerRef.current?.playChunk(base64Pcm);
        },
        onTurnComplete: () => {
          // Model finished speaking
        },
        onInterrupted: () => {
          // Barge-in: the student spoke over the tutor — drop pending audio.
          playerRef.current?.flush();
        },
        onError: (err) => {
          if (mountedRef.current) {
            setError(err);
            setStatus('error');
          }
        },
      });

      sessionRef.current = session;
      hasKickedOffRef.current = false;
      sentCardsRef.current.clear();
      readCardsRef.current.clear();
      sentQuizRef.current = null;
      sentAnswerRef.current = null;
      sentQuizResultRef.current = null;

      await session.connect({
        apiKey: config.apiKey,
        systemInstruction: config.systemInstruction,
        voice: config.voice,
      });
    } catch (err) {
      connectInFlightRef.current = false;
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to connect');
        setStatus('error');
      }
    }
  }, [topic, readingLevel, status]);

  // ── Disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    connectInFlightRef.current = false;
    connectAttemptRef.current += 1;
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    sentCardsRef.current.clear();
    readCardsRef.current.clear();
    sentQuizRef.current = null;
    sentAnswerRef.current = null;
    sentQuizResultRef.current = null;
    hasKickedOffRef.current = false;
    if (mountedRef.current) {
      setStatus('idle');
      setIsMicOpen(false);
      setIsSpeaking(false);
    }
  }, []);

  // Auto-connect when the overlay mounts so the tutor starts speaking
  // as soon as cards appear — no manual click required.
  useEffect(() => {
    if (status === 'idle') {
      connect();
    }
    // Only run on mount — `connect` identity changes with `status`, but we
    // only want the initial trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Seed card content as context before the conversation starts ───────────
  // Gemini 3.1 Live only accepts `clientContent` context while seeding the
  // initial history; once the tutor has spoken, card content must travel
  // inside the `sendText` messages below instead.

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || hasKickedOffRef.current) return;

    for (let i = 0; i < allCards.length; i++) {
      const card = allCards[i];
      if (!sentCardsRef.current.has(card)) {
        sentCardsRef.current.add(card);
        session.sendContext(`[CARD ${i + 1} CONTENT]\n${card}`);
      }
    }
  }, [status, allCards]);

  // ── Read the visible card aloud (kickoff on the first, then on each flip) ──

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || !currentCardContent) return;
    if (readCardsRef.current.has(currentCardContent)) return;
    readCardsRef.current.add(currentCardContent);
    sentCardsRef.current.add(currentCardContent);

    if (!hasKickedOffRef.current) {
      hasKickedOffRef.current = true;
      // Small delay to let the seeded context settle
      setTimeout(() => {
        session.sendText(
          `[FIRST CARD]\n${currentCardContent}\n\nBegin now. Start by giving a brief, enthusiastic introduction to the topic, then explain the content of this first card. Keep it conversational and engaging. Do NOT greet me or say hello.`
        );
      }, 500);
    } else {
      session.sendText(
        `[CURRENT CARD — the student just flipped to this card]\n${currentCardContent}\n\nThe student just moved to this card. Explain its content naturally, building on what you've already covered. Keep it brief and conversational.`
      );
    }
  }, [currentCardContent, status]);

  // ── Inject quiz context ────────────────────────────────────────────────────

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || !quizContext) return;
    if (sentQuizRef.current === quizContext) return;

    sentQuizRef.current = quizContext;
    // Reset answer tracking for this new question
    sentAnswerRef.current = null;
    session.sendText(
      `[QUIZ QUESTION]\n${quizContext}\n\nA quiz question has appeared! Read it out loud engagingly and let the student think about the answer. Do not reveal the correct answer.`
    );
  }, [quizContext, status]);

  // ── React to the student's answer ─────────────────────────────────────────

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || !answerResult) return;
    if (sentAnswerRef.current === answerResult) return;

    sentAnswerRef.current = answerResult;
    // Flush any in-progress speech so the tutor reacts immediately
    playerRef.current?.flush();
    session.sendText(
      `${answerResult}\n\nReact to how the student answered. Be concise — one or two sentences. Be encouraging if correct, gently corrective if wrong. Then stop and wait for the next question.`
    );
  }, [answerResult, status]);

  // ── Remark on the end of the quiz ──────────────────────────────────────────

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || !quizResult) return;
    if (sentQuizResultRef.current === quizResult) return;

    sentQuizResultRef.current = quizResult;
    // Flush any lingering answer reaction so the wrap-up starts cleanly
    playerRef.current?.flush();
    session.sendText(
      `${quizResult}\n\nThe quiz has ended and the student is looking at their scorecard. Give a short closing remark on their overall performance — celebrate a strong score, or be warm and encouraging about trying again if they struggled. Two sentences at most, then stop.`
    );
  }, [quizResult, status]);

  // ── Pause/flush audio if quiz becomes active ───────────────────────────────
  useEffect(() => {
    if (isQuizActive && playerRef.current) {
      playerRef.current.flush();
      setIsSpeaking(false);
    }
  }, [isQuizActive]);

  // ── Locate the quiz header's control slot while the quiz is open ──────────
  useEffect(() => {
    if (!isQuizActive) {
      setQuizPortalEl(null);
      return;
    }
    // Both components commit in the same render pass; query after commit.
    setQuizPortalEl(document.getElementById('quiz-live-controls'));
  }, [isQuizActive]);

  // ── Mute / Unmute speaker ──────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        // Muting — flush pending audio but keep the context alive so
        // the muted flag is respected when the next card triggers audio.
        playerRef.current?.flush();
        setIsSpeaking(false);
      }
      return next;
    });
  }, []);

  // ── Update player mute state ───────────────────────────────────────────────

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted = isMuted;
    }
    mutedRef.current = isMuted;
  }, [isMuted]);

  // ── Mic toggle ─────────────────────────────────────────────────────────────

  const toggleMic = useCallback(async () => {
    if (status !== 'connected') return;

    if (isMicOpen) {
      // Close mic — and tell the server the audio stream ended, so voice
      // activity detection commits the user's turn instead of waiting for
      // trailing silence that will never arrive.
      recorderRef.current?.stop();
      recorderRef.current = null;
      sessionRef.current?.sendAudioStreamEnd();
      setIsMicOpen(false);
    } else {
      // Open mic
      try {
        const { AudioRecorder } = await import('@/lib/audio-recorder');
        const recorder = new AudioRecorder();
        await recorder.start((base64Chunk) => {
          sessionRef.current?.sendAudio(base64Chunk);
        });
        recorderRef.current = recorder;
        setError(null);
        setIsMicOpen(true);
      } catch (err) {
        setError(
          err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
            ? 'Microphone access denied'
            : err instanceof Error
              ? err.message
              : 'Microphone unavailable',
        );
      }
    }
  }, [status, isMicOpen]);

  // If the session drops while the mic is open, stop capturing — otherwise
  // the recorder keeps streaming into a dead session and the mic UI is gone.
  useEffect(() => {
    if (status !== 'connected' && recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
      setIsMicOpen(false);
    }
  }, [status]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // The parent (Message.tsx) only mounts this component when `topic` and
  // `isLastMessage` are truthy, so we always render the audio icon here.

  const controlBar = (
    <div className="gemini-live-bar flex items-center gap-1.5">
      {/* Speaker mute/unmute */}
      <button
        type="button"
        id="gemini-live-speaker-toggle"
        onClick={status === 'connected' ? toggleMute : connect}
        disabled={status === 'connecting'}
        aria-label={isMuted ? 'Unmute tutor' : 'Mute tutor'}
        title={
          status === 'idle'
            ? 'Start voice tutor'
            : status === 'connecting'
              ? 'Connecting…'
              : isMuted
                ? 'Unmute tutor'
                : 'Mute tutor'
        }
        className={`relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full
          transition-all duration-200
          ${status === 'connecting'
            ? 'bg-accent/20 text-accent animate-pulse'
            : status === 'error'
              ? 'bg-danger/10 text-danger'
              : isMuted
                ? 'bg-state-hover text-text-tertiary hover:bg-state-hover-soft hover:text-text-secondary'
                : 'bg-accent/15 text-accent hover:bg-accent/25'
          }
          disabled:pointer-events-none disabled:opacity-50`}
      >
        <PulseRing active={isSpeaking && !isMuted} />
        <span className="relative z-10">
          {status === 'connecting' ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : isMuted ? (
            <SpeakerOffIcon />
          ) : (
            <SpeakerOnIcon />
          )}
        </span>
      </button>

      {/* Mic toggle — only shown when connected */}
      {status === 'connected' && (
        <button
          type="button"
          id="gemini-live-mic-toggle"
          onClick={toggleMic}
          aria-label={isMicOpen ? 'Stop listening' : 'Ask a question'}
          title={isMicOpen ? 'Stop listening' : 'Ask a question'}
          className={`relative flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1
            text-[11px] font-medium transition-all duration-200
            ${isMicOpen
              ? 'bg-red-500/15 text-red-500 hover:bg-red-500/25'
              : 'bg-state-hover text-text-tertiary hover:bg-state-hover-soft hover:text-text-secondary'
            }`}
        >
          {isMicOpen && (
            <span className="absolute inset-0 rounded-full border-2 border-red-500/40 animate-pulse" />
          )}
          <span className="relative z-10">
            {isMicOpen ? <MicOnIcon /> : <MicOffIcon />}
          </span>
          <span className="relative z-10">{isMicOpen ? 'Listening…' : 'Ask Question'}</span>
        </button>
      )}

      {/* Error indicator */}
      {error && (
        <span
          className="max-w-[120px] truncate text-[10px] text-danger"
          title={error}
        >
          {error}
        </span>
      )}
    </div>
  );

  // While the quiz takeover covers the card, teleport the controls into its
  // header so mute and ask-a-question stay reachable without a second session.
  return quizPortalEl ? createPortal(controlBar, quizPortalEl) : controlBar;
}
