/**
 * Gemini Live Session — uses the @google/genai SDK's live.connect()
 * for reliable bidirectional audio streaming.
 *
 * The API key is passed in at connect-time by the caller (fetched from a
 * server endpoint via BFF pattern — never hardcoded or stored client-side).
 *
 * This replaces the old raw-WebSocket approach with the SDK's built-in
 * connection management, matching the hansel/orchestrator reference.
 */

import { GoogleGenAI, Modality } from '@google/genai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeminiVoice =
  | 'Puck'
  | 'Charon'
  | 'Kore'
  | 'Fenrir'
  | 'Aoede'
  | 'Leda'
  | 'Orus';

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface GeminiLiveCallbacks {
  onStatusChange?: (status: SessionStatus) => void;
  onAudioChunk?: (base64Pcm: string) => void;
  onTextChunk?: (text: string) => void;
  onTurnComplete?: () => void;
  /** Barge-in: the server cut the model off because the user spoke. */
  onInterrupted?: () => void;
  onError?: (error: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = 'gemini-3.1-flash-live-preview';

/** Interval (ms) between keepalive silent frames. */
const KEEPALIVE_INTERVAL_MS = 15_000;

/** Max automatic reconnects after a server GoAway before giving up. */
const MAX_GOAWAY_RECONNECTS = 3;

/** Connection timeout (ms). */
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * 10 ms of silence at 16 kHz, 16-bit mono PCM = 320 bytes = 160 samples.
 * Pre-computed as a base64 string so we don't allocate on every tick.
 */
const SILENT_FRAME_BASE64 = generateSilentFrame();

function generateSilentFrame(): string {
  const bytes = new Uint8Array(320); // 160 samples × 2 bytes, all zeros = silence
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GeminiLiveConfig {
  apiKey: string;
  systemInstruction: string;
  voice?: GeminiVoice;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export class GeminiLiveSession {
  private _status: SessionStatus = 'idle';
  private session: any = null; // SDK session object
  private client: any = null; // GoogleGenAI client
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private readonly callbacks: GeminiLiveCallbacks;

  // GoAway reconnection: the server periodically asks long-lived connections
  // to reconnect. We remember the last config and dial back in transparently,
  // passing the resumption handle so the conversation context survives.
  private lastConfig: GeminiLiveConfig | null = null;
  private goAwayReceived = false;
  private reconnectAttempts = 0;
  private sessionEpoch = 0;
  private resumptionHandle: string | null = null;
  /** Timestamp of the last real audio frame — keepalive backs off while the mic streams. */
  private lastAudioSentAt = 0;

  constructor(callbacks: GeminiLiveCallbacks) {
    this.callbacks = callbacks;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  get status(): SessionStatus {
    return this._status;
  }

  /**
   * Connect to Gemini Live using the @google/genai SDK.
   * The caller is responsible for obtaining the API key from the server.
   */
  async connect(config: GeminiLiveConfig): Promise<void> {
    return this.doConnect(config, false);
  }

  private async doConnect(config: GeminiLiveConfig, isReconnect: boolean): Promise<void> {
    // Prevent double-connect
    this.teardownSession();

    if (!isReconnect) {
      // Fresh conversation — don't restore a previous session's context.
      this.resumptionHandle = null;
      this.reconnectAttempts = 0;
    }

    this.lastConfig = config;
    this.goAwayReceived = false;
    this.setStatus('connecting');

    try {
      // Create a fresh SDK client with the API key
      this.client = new GoogleGenAI({ apiKey: config.apiKey });

      const epoch = ++this.sessionEpoch;
      const voice = config.voice ?? 'Puck';

      // Session config matching the reference implementation
      const sessionConfig: any = {
        responseModalities: [Modality.AUDIO],
        systemInstruction: { parts: [{ text: config.systemInstruction }] },
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
        realtimeInputConfig: {
          turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
          automaticActivityDetection: {
            startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
            endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
            silenceDurationMs: 1000,
            prefixPaddingMs: 100,
          },
        },
        // The server periodically recycles long-lived connections (GoAway)
        // and hard-caps session duration. Resumption lets us dial back in
        // with the full conversation state intact; sliding-window compression
        // lifts the context-size cap so one session spans lecture + quiz.
        sessionResumption: this.resumptionHandle ? { handle: this.resumptionHandle } : {},
        contextWindowCompression: { slidingWindow: {} },
      };

      // Connect with timeout (matching hansel pattern)
      const connectPromise = this.client.live.connect({
        model: MODEL,
        config: sessionConfig,
        callbacks: {
          onopen: () => {
            if (epoch !== this.sessionEpoch) return;
            this.reconnectAttempts = 0;
            this.setStatus('connected');
            this.startKeepalive();
          },
          onmessage: (msg: any) => {
            if (epoch !== this.sessionEpoch) return;
            this.handleMessage(msg);
          },
          onerror: (e: any) => {
            if (epoch !== this.sessionEpoch) return;
            this.stopKeepalive();
            this.handleError(e?.message || 'Gemini session error');
          },
          onclose: (e: any) => {
            if (epoch !== this.sessionEpoch) return;
            this.stopKeepalive();

            // Normal close without GoAway — don't reconnect
            if (e?.code === 1000 && !this.goAwayReceived) {
              this.setStatus('idle');
              return;
            }

            // Attempt transparent reconnection on GoAway, resuming the
            // previous session's context via the resumption handle.
            if (this.lastConfig && this.reconnectAttempts < MAX_GOAWAY_RECONNECTS) {
              this.goAwayReceived = false;
              this.reconnectAttempts++;
              this.doConnect(this.lastConfig, true);
              return;
            }

            if (this._status === 'connected' || this._status === 'connecting') {
              const reason = e?.reason || `Connection closed (code ${e?.code})`;
              this.handleError(reason);
            }
          },
        },
      });

      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)),
          CONNECT_TIMEOUT_MS,
        );
      });

      this.session = await Promise.race([connectPromise, timeoutPromise]).finally(() =>
        clearTimeout(timeoutId!),
      );
    } catch (err) {
      this.handleError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }

  /** Send raw microphone audio (base64-encoded PCM16 16 kHz). */
  sendAudio(base64Data: string): void {
    if (!this.session) return;
    try {
      this.lastAudioSentAt = Date.now();
      this.session.sendRealtimeInput({
        audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' },
      });
    } catch {
      // session may be closing
    }
  }

  /**
   * Tell the server the mic was turned off. Without this, automatic activity
   * detection keeps waiting for trailing silence *audio* to commit
   * end-of-speech — silence that never arrives once the stream stops — and
   * the model never responds to what the user just said.
   */
  sendAudioStreamEnd(): void {
    if (!this.session) return;
    try {
      this.session.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      // session may be closing
    }
  }

  /**
   * Seed context without triggering a model response.
   *
   * Gemini 3.1 Live only honours `clientContent` for seeding the initial
   * history — once the conversation has started it is ignored. Callers must
   * only use this before the first `sendText`; after that, fold context into
   * the `sendText` message itself.
   */
  sendContext(text: string): void {
    if (!this.session) return;
    try {
      this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: false,
      });
    } catch {
      // session may be closing
    }
  }

  /** Send text that triggers a model response. */
  sendText(text: string): void {
    if (!this.session) return;
    try {
      // Primary: sendClientContent with turnComplete triggers a response
      this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      });
    } catch {
      // Fallback: sendRealtimeInput for older sessions
      try {
        this.session.sendRealtimeInput({ text });
      } catch {
        // session may be closing
      }
    }
  }

  /** Tear down the connection and all timers. */
  disconnect(): void {
    this.teardownSession();
    this.lastConfig = null;
    this.goAwayReceived = false;
    this.reconnectAttempts = 0;
    this.resumptionHandle = null;
    this.setStatus('idle');
  }

  /**
   * Close the underlying socket and timers without resetting reconnect
   * bookkeeping — used both by disconnect() and by GoAway reconnects, which
   * must keep the attempt counter and resumption handle.
   */
  private teardownSession(): void {
    this.stopKeepalive();
    this.sessionEpoch++;

    if (this.session) {
      const session = this.session;
      this.session = null;
      try {
        session.close();
      } catch {
        // Session may already be closed — ignore.
      }
    }

    this.client = null;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private setStatus(status: SessionStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.callbacks.onStatusChange?.(status);
  }

  private handleMessage(msg: any): void {
    // GoAway — the server wants us to reconnect; the close handler follows.
    if (msg?.goAway !== undefined) {
      this.goAwayReceived = true;
      return;
    }

    // Session resumption checkpoint — remember the latest resumable handle
    // so a GoAway reconnect restores the conversation instead of starting over.
    if (msg?.sessionResumptionUpdate !== undefined) {
      const update = msg.sessionResumptionUpdate;
      if (update?.resumable && update?.newHandle) {
        this.resumptionHandle = update.newHandle;
      }
      return;
    }

    // The SDK delivers parsed message objects. Extract audio and text from
    // serverContent.modelTurn.parts.
    const content = msg?.serverContent;
    if (!content) return;

    if (content.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.callbacks.onAudioChunk?.(part.inlineData.data);
        }
        if (part.text) {
          this.callbacks.onTextChunk?.(part.text);
        }
      }
    }

    if (content.turnComplete) {
      this.callbacks.onTurnComplete?.();
    }

    // Barge-in: the user spoke over the model — playback should be flushed.
    if (content.interrupted) {
      this.callbacks.onInterrupted?.();
    }
  }

  private handleError(message: string): void {
    this.setStatus('error');
    this.callbacks.onError?.(message);
  }

  // -----------------------------------------------------------------------
  // Keepalive
  // -----------------------------------------------------------------------

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      // Skip while real mic audio is flowing — injecting silent frames into
      // the middle of live speech corrupts the stream the VAD is analyzing.
      if (Date.now() - this.lastAudioSentAt < KEEPALIVE_INTERVAL_MS) return;
      this.sendAudio(SILENT_FRAME_BASE64);
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer !== null) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}
