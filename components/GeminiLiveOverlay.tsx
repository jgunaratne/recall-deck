'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  /** All card contents for full context */
  allCards: string[];
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
  allCards,
}: GeminiLiveOverlayProps) {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for the session, recorder, and player (lazy-loaded)
  const sessionRef = useRef<import('@/lib/gemini-live-session').GeminiLiveSession | null>(null);
  const recorderRef = useRef<import('@/lib/audio-recorder').AudioRecorder | null>(null);
  const playerRef = useRef<import('@/lib/audio-player').AudioPlayer | null>(null);
  const sentCardsRef = useRef<Set<string>>(new Set());
  const sentQuizRef = useRef<string | null>(null);
  const hasKickedOffRef = useRef(false);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Connect to Gemini Live ─────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (status === 'connecting' || status === 'connected') return;

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

      // Create audio player
      const player = new AudioPlayer();
      player.onPlaybackStart = () => {
        if (mountedRef.current) setIsSpeaking(true);
      };
      player.onPlaybackEnd = () => {
        if (mountedRef.current) setIsSpeaking(false);
      };
      playerRef.current = player;

      // Create session
      const session = new GeminiLiveSession({
        onStatusChange: (s) => {
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
      sentQuizRef.current = null;

      session.connect({
        apiKey: config.apiKey,
        systemInstruction: config.systemInstruction,
        voice: config.voice,
      });
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to connect');
        setStatus('error');
      }
    }
  }, [topic, readingLevel, status]);

  // ── Disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    sentCardsRef.current.clear();
    sentQuizRef.current = null;
    hasKickedOffRef.current = false;
    if (mountedRef.current) {
      setStatus('idle');
      setIsMicOpen(false);
      setIsSpeaking(false);
    }
  }, []);

  // ── Auto-connect when first card content arrives ───────────────────────────

  useEffect(() => {
    if (currentCardContent && status === 'idle') {
      connect();
    }
  }, [currentCardContent, status, connect]);

  // ── Stream card content as context ─────────────────────────────────────────

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || !currentCardContent) return;

    // Send all accumulated cards as context (deduplicated)
    for (const card of allCards) {
      if (!sentCardsRef.current.has(card)) {
        sentCardsRef.current.add(card);
        session.sendContext(`[CARD CONTENT]\n${card}`);
      }
    }

    // On first connection + card, kick off the reading
    if (!hasKickedOffRef.current && currentCardContent) {
      hasKickedOffRef.current = true;
      // Small delay to let context settle
      setTimeout(() => {
        session.sendText(
          'Begin now. Start by giving a brief, enthusiastic introduction to the topic, then explain the content of the first card. Keep it conversational and engaging. Do NOT greet me or say hello.'
        );
      }, 500);
    }
  }, [status, currentCardContent, allCards]);

  // ── Stream new card content when card changes ──────────────────────────────

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || !currentCardContent) return;

    if (!sentCardsRef.current.has(currentCardContent)) {
      sentCardsRef.current.add(currentCardContent);
      session.sendContext(`[CURRENT CARD - Read this next]\n${currentCardContent}`);
      // Prompt to read the new card
      session.sendText('A new card has appeared. Please explain the content of this new card naturally, building on what you\'ve already covered.');
    }
  }, [currentCardContent, status]);

  // ── Inject quiz context ────────────────────────────────────────────────────

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || !quizContext) return;
    if (sentQuizRef.current === quizContext) return;

    sentQuizRef.current = quizContext;
    session.sendContext(`[QUIZ QUESTION]\n${quizContext}`);
    session.sendText('A quiz question has appeared! Read it out loud engagingly and let the student think about the answer.');
  }, [quizContext, status]);

  // ── Mute / Unmute speaker ──────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        // Muting — stop current playback
        playerRef.current?.stop();
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
  }, [isMuted]);

  // ── Mic toggle ─────────────────────────────────────────────────────────────

  const toggleMic = useCallback(async () => {
    if (status !== 'connected') return;

    if (isMicOpen) {
      // Close mic
      recorderRef.current?.stop();
      recorderRef.current = null;
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
        setIsMicOpen(true);
      } catch (err) {
        setError('Microphone access denied');
      }
    }
  }, [status, isMicOpen]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // ── Don't render if no content ─────────────────────────────────────────────

  if (status === 'idle' && !currentCardContent) return null;

  return (
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
          aria-label={isMicOpen ? 'Close microphone' : 'Open microphone'}
          title={isMicOpen ? 'Close microphone' : 'Open microphone'}
          className={`relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full
            transition-all duration-200
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
}
