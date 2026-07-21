'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MICROPHONE_INPUT_STORAGE_KEY } from '@/lib/audio-input';
import type { ReadingLevel } from '@/lib/prompts';

type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface OpenAIRealtimeOverlayProps {
  topic: string;
  readingLevel: ReadingLevel;
  isStreaming: boolean;
  currentCardContent: string | null;
  quizContext: string | null;
  answerResult: string | null;
  quizResult: string | null;
  allCards: string[];
  isQuizActive?: boolean;
}

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

function ErrorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function PulseRing({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" style={{ animationDuration: '1.5s' }} />
  );
}

interface BrowserAudioCapture {
  stop: () => Promise<{ audio: Blob; peakLevel: number }>;
}

async function startBrowserAudioCapture(
  deviceId: string,
  onLevel: (level: number) => void,
  onActiveInput: (activeDeviceId: string) => void,
): Promise<BrowserAudioCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const activeDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId || '';
  onActiveInput(activeDeviceId);
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find((type) => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  const monitorGain = audioContext.createGain();
  const samples = new Float32Array(analyser.fftSize);
  let peakLevel = 0;
  let animationFrame = 0;
  let lastLevelUpdate = 0;
  let complete: Promise<{ audio: Blob; peakLevel: number }> | null = null;

  // Keep the analyzer's graph alive without playing the microphone locally.
  monitorGain.gain.value = 0;
  source.connect(analyser).connect(monitorGain).connect(audioContext.destination);
  if (audioContext.state !== 'running') await audioContext.resume();
  const readLevel = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const level = Math.sqrt(sum / samples.length);
    peakLevel = Math.max(peakLevel, level);
    const now = performance.now();
    if (now - lastLevelUpdate > 100) {
      lastLevelUpdate = now;
      onLevel(level);
    }
    animationFrame = requestAnimationFrame(readLevel);
  };
  readLevel();

  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.start(250);

  return {
    stop: () => {
      if (!complete) {
        complete = new Promise<{ audio: Blob; peakLevel: number }>((resolve, reject) => {
          const cleanup = () => {
            cancelAnimationFrame(animationFrame);
            source.disconnect();
            analyser.disconnect();
            monitorGain.disconnect();
            void audioContext.close();
            stream.getTracks().forEach((track) => track.stop());
          };
          recorder.onstop = () => {
            cleanup();
            resolve({
              audio: new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' }),
              peakLevel,
            });
          };
          recorder.onerror = () => {
            cleanup();
            reject(new Error('Microphone recording failed.'));
          };
          if (recorder.state !== 'inactive') recorder.stop();
        });
      }
      return complete;
    },
  };
}

export default function OpenAIRealtimeOverlay({
  topic,
  readingLevel,
  currentCardContent,
  quizContext,
  answerResult,
  quizResult,
  allCards,
  isQuizActive,
}: OpenAIRealtimeOverlayProps) {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [quizPortalEl, setQuizPortalEl] = useState<HTMLElement | null>(null);

  const sessionRef = useRef<import('@/lib/openai-realtime-session').OpenAIRealtimeSession | null>(null);
  const recorderRef = useRef<BrowserAudioCapture | null>(null);
  const mutedRef = useRef(false);
  const sentCardsRef = useRef<Set<string>>(new Set());
  const lastSpokenCardRef = useRef<string | null>(null);
  const sentQuizRef = useRef<string | null>(null);
  const sentAnswerRef = useRef<string | null>(null);
  const sentQuizResultRef = useRef<string | null>(null);
  const hasKickedOffRef = useRef(false);
  const connectInFlightRef = useRef(false);
  const connectAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const connect = useCallback(async () => {
    if (connectInFlightRef.current) return;
    if (status === 'connecting' || status === 'connected') return;
    connectInFlightRef.current = true;
    const attempt = ++connectAttemptRef.current;

    setStatus('connecting');
    setError(null);

    try {
      const res = await fetch('/api/openai-realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, readingLevel }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to get OpenAI Realtime session');
      }

      const config = await res.json();
      const { OpenAIRealtimeSession } = await import('@/lib/openai-realtime-session');

      if (attempt !== connectAttemptRef.current) return;

      const session = new OpenAIRealtimeSession({
        onStatusChange: (s) => {
          if (s === 'error' || s === 'idle') {
            connectInFlightRef.current = false;
          }
          if (!mountedRef.current) return;
          setStatus(s);
          if (s === 'error') setIsSpeaking(false);
        },
        onSpeakingChange: (speaking) => {
          if (!mountedRef.current) return;
          setIsSpeaking(speaking && !mutedRef.current);
        },
        onInterrupted: () => {
          if (mountedRef.current) setIsSpeaking(false);
        },
        onInputTranscript: (transcript) => {
          if (mountedRef.current) setLastTranscript(transcript);
        },
        onError: (err) => {
          connectInFlightRef.current = false;
          if (mountedRef.current) {
            setError(err);
            setStatus('error');
          }
        },
      });

      sessionRef.current = session;
      session.setMuted(mutedRef.current);
      hasKickedOffRef.current = false;
      sentCardsRef.current.clear();
      lastSpokenCardRef.current = null;
      sentQuizRef.current = null;
      sentAnswerRef.current = null;
      sentQuizResultRef.current = null;

      await session.connect({ clientSecret: config.clientSecret });
    } catch (err) {
      connectInFlightRef.current = false;
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to connect');
        setStatus('error');
      }
    }
  }, [topic, readingLevel, status]);

  const disconnect = useCallback(() => {
    connectInFlightRef.current = false;
    connectAttemptRef.current += 1;
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    sentCardsRef.current.clear();
    lastSpokenCardRef.current = null;
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

  useEffect(() => {
    if (status !== 'idle') return;
    const timer = window.setTimeout(() => {
      void connect();
    }, 0);
    return () => window.clearTimeout(timer);
    // Only auto-connect on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || !currentCardContent) return;
    if (lastSpokenCardRef.current === currentCardContent) return;
    lastSpokenCardRef.current = currentCardContent;
    sentCardsRef.current.add(currentCardContent);

    // Card navigation is an explicit interruption: stop the previous audio
    // before the session queues narration for the newly visible card.
    session.clearOutput();

    if (!hasKickedOffRef.current) {
      hasKickedOffRef.current = true;
      session.sendText(
        `[FIRST CARD]\n${currentCardContent}\n\nBegin now. Start by giving a brief, enthusiastic introduction to the topic, then explain the content of this first card. Keep it conversational and engaging. Do NOT greet me or say hello.`,
      );
    } else {
      session.sendText(
        `[CURRENT CARD - the student just flipped to this card]\n${currentCardContent}\n\nThe student just moved to this card. Explain its content naturally, building on what you've already covered. Keep it brief and conversational.`,
      );
    }
  }, [currentCardContent, status]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || !quizContext) return;
    if (sentQuizRef.current === quizContext) return;

    sentQuizRef.current = quizContext;
    sentAnswerRef.current = null;
    session.clearOutput();
    session.sendText(
      `[QUIZ QUESTION]\n${quizContext}\n\nA quiz question has appeared! Read it out loud engagingly and let the student think about the answer. Do not reveal the correct answer.`,
    );
  }, [quizContext, status]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || !answerResult) return;
    if (sentAnswerRef.current === answerResult) return;

    sentAnswerRef.current = answerResult;
    session.clearOutput();
    session.sendText(
      `${answerResult}\n\nReact to how the student answered. Be concise - one or two sentences. Be encouraging if correct, gently corrective if wrong. Then stop and wait for the next question.`,
    );
  }, [answerResult, status]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || status !== 'connected' || !quizResult) return;
    if (sentQuizResultRef.current === quizResult) return;

    sentQuizResultRef.current = quizResult;
    session.clearOutput();
    session.sendText(
      `${quizResult}\n\nThe quiz has ended and the student is looking at their scorecard. Give a short closing remark on their overall performance - celebrate a strong score, or be warm and encouraging about trying again if they struggled. Two sentences at most, then stop.`,
    );
  }, [quizResult, status]);

  useEffect(() => {
    if (isQuizActive) {
      sessionRef.current?.clearOutput();
      const timer = window.setTimeout(() => setIsSpeaking(false), 0);
      return () => window.clearTimeout(timer);
    }
  }, [isQuizActive]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuizPortalEl(isQuizActive ? document.getElementById('quiz-live-controls') : null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isQuizActive]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      sessionRef.current?.setMuted(next);
      if (next) setIsSpeaking(false);
      return next;
    });
  }, []);

  useEffect(() => {
    mutedRef.current = isMuted;
    sessionRef.current?.setMuted(isMuted);
  }, [isMuted]);

  const toggleMic = useCallback(async () => {
    const session = sessionRef.current;
    if (status !== 'connected' || !session) return;

    if (isMicOpen) {
      const recording = await recorderRef.current?.stop();
      recorderRef.current = null;
      setIsMicOpen(false);
      setMicLevel(0);
      if (!recording?.audio.size) {
        setError('No microphone audio was captured. Please try again.');
        return;
      }
      if (recording.peakLevel < 0.003) {
        setError('No audible microphone input was detected. Check the browser microphone permission and selected input device.');
        return;
      }

      setIsSubmittingQuestion(true);
      try {
        const response = await fetch('/api/openai-realtime/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': recording.audio.type || 'audio/webm' },
          body: recording.audio,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.transcript) {
          throw new Error(data?.error || 'OpenAI could not understand the recorded question.');
        }

        setLastTranscript(data.transcript);
        sessionRef.current?.sendText(
          `[STUDENT SPOKEN QUESTION]\n${data.transcript}\n\nAnswer the student's question directly and specifically.`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to transcribe the recorded question.');
      } finally {
        if (mountedRef.current) setIsSubmittingQuestion(false);
      }
      return;
    }

    try {
      session.beginQuestion();
      setLastTranscript(null);
      setMicLevel(0);
      const recorder = await startBrowserAudioCapture(
        window.localStorage.getItem(MICROPHONE_INPUT_STORAGE_KEY) || '',
        (level) => {
          if (mountedRef.current) setMicLevel(level);
        },
        (activeDeviceId) => {
          if (!window.localStorage.getItem(MICROPHONE_INPUT_STORAGE_KEY) && activeDeviceId) {
            window.localStorage.setItem(MICROPHONE_INPUT_STORAGE_KEY, activeDeviceId);
          }
        },
      );
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
  }, [status, isMicOpen, isSubmittingQuestion]);

  useEffect(() => {
    if (status !== 'connected' && recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
      const timer = window.setTimeout(() => setIsMicOpen(false), 0);
      return () => window.clearTimeout(timer);
    }
  }, [status]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const controlBar = (
    <div className="openai-realtime-bar flex items-center gap-1.5">
      <button
        type="button"
        id="openai-realtime-speaker-toggle"
        onClick={status === 'connected' ? toggleMute : connect}
        disabled={status === 'connecting'}
        aria-label={isMuted ? 'Unmute tutor' : 'Mute tutor'}
        title={
          status === 'idle'
            ? 'Start voice tutor'
            : status === 'connecting'
              ? 'Connecting...'
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

      {status === 'connected' && (
        <button
          type="button"
          id="openai-realtime-mic-toggle"
          onClick={toggleMic}
          disabled={isSubmittingQuestion}
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
            <span className="absolute inset-0 animate-pulse rounded-full border-2 border-red-500/40" />
          )}
          <span className="relative z-10">
            {isMicOpen ? <MicOnIcon /> : <MicOffIcon />}
          </span>
          <span className="relative z-10">
            {isMicOpen
              ? micLevel >= 0.003 ? 'Listening...' : 'Waiting for voice...'
              : isSubmittingQuestion ? 'Understanding...' : 'Ask Question'}
          </span>
        </button>
      )}

      {lastTranscript && !isMicOpen && (
        <span
          tabIndex={0}
          aria-label={`OpenAI heard: ${lastTranscript}`}
          className="group relative flex h-6 w-6 shrink-0 cursor-help items-center justify-center rounded-full text-text-tertiary hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
            <path d="M8 11h8" />
          </svg>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-64 rounded-md bg-text-primary px-3 py-2 text-left text-xs leading-4 text-surface opacity-0 shadow-popover transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {lastTranscript}
          </span>
        </span>
      )}

      {error && (
        <span
          role="img"
          aria-label={`Voice tutor error: ${error}`}
          tabIndex={0}
          className="group relative flex h-6 w-6 shrink-0 cursor-help items-center justify-center rounded-full text-danger hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          <ErrorIcon />
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-64 rounded-md bg-text-primary px-3 py-2 text-left text-xs leading-4 text-surface opacity-0 shadow-popover transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {error}
          </span>
        </span>
      )}
    </div>
  );

  return quizPortalEl ? createPortal(controlBar, quizPortalEl) : controlBar;
}
