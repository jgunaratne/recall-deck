/**
 * Gemini Live Session — browser-side WebSocket client for
 * google.ai.generativelanguage BidiGenerateContent streaming.
 *
 * The API key is passed in at connect-time by the caller (fetched from a
 * server endpoint via BFF pattern — never hardcoded or stored client-side).
 *
 * Protocol reference (2025-07 beta):
 *   - Setup message sent on open, waits for `setupComplete`
 *   - Audio sent as base64 PCM16 16 kHz via `realtimeInput`
 *   - Server sends `serverContent.modelTurn.parts` (audio/text)
 *   - Server sends `serverContent.turnComplete` when done
 */

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

const WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const MODEL = 'models/gemini-3.1-flash-live-preview';

/** Max automatic reconnects after a server GoAway before giving up. */
const MAX_GOAWAY_RECONNECTS = 3;

/** Interval (ms) between keepalive silent frames. */
const KEEPALIVE_INTERVAL_MS = 15_000;

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
// Server message shapes (only the fields we care about)
// ---------------------------------------------------------------------------

interface ServerContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface ServerMessage {
  setupComplete?: Record<string, unknown>;
  goAway?: Record<string, unknown>;
  serverContent?: {
    modelTurn?: {
      parts?: ServerContentPart[];
    };
    turnComplete?: boolean;
    interrupted?: boolean;
  };
}

export interface GeminiLiveConfig {
  apiKey: string;
  systemInstruction: string;
  voice?: GeminiVoice;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export class GeminiLiveSession {
  private _status: SessionStatus = 'idle';
  private ws: WebSocket | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private readonly callbacks: GeminiLiveCallbacks;

  // GoAway reconnection (podchat/Hansel pattern): the server periodically asks
  // long-lived connections to reconnect. We remember the last config and dial
  // back in transparently instead of surfacing an error.
  private lastConfig: GeminiLiveConfig | null = null;
  private goAwayReceived = false;
  private reconnectAttempts = 0;

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
   * Open a WebSocket to Gemini Live and send the setup message.
   * The caller is responsible for obtaining the API key from the server.
   */
  connect(config: GeminiLiveConfig): void {
    // Prevent double-connect
    if (this.ws) {
      this.disconnect();
    }

    this.lastConfig = config;
    this.goAwayReceived = false;
    this.setStatus('connecting');

    const url = `${WS_BASE}?key=${encodeURIComponent(config.apiKey)}`;
    const ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      this.sendSetup(config.systemInstruction, config.voice ?? 'Puck');
      this.startKeepalive();
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      this.handleMessage(event);
    });

    ws.addEventListener('error', () => {
      // The browser doesn't expose error details for WebSockets (by design).
      this.handleError('WebSocket connection error');
    });

    ws.addEventListener('close', (event: CloseEvent) => {
      this.stopKeepalive();
      this.ws = null;

      // Server-initiated GoAway — reconnect with the same config.
      if (this.goAwayReceived && this.lastConfig && this.reconnectAttempts < MAX_GOAWAY_RECONNECTS) {
        this.reconnectAttempts += 1;
        this.connect(this.lastConfig);
        return;
      }

      if (this._status === 'connected' || this._status === 'connecting') {
        const reason = event.reason || `Connection closed (code ${event.code})`;
        this.handleError(reason);
      }
    });

    this.ws = ws;
  }

  /** Send raw microphone audio (base64-encoded PCM16 16 kHz). */
  sendAudio(base64Data: string): void {
    this.send({
      realtimeInput: {
        audio: {
          data: base64Data,
          mimeType: 'audio/pcm;rate=16000',
        },
      },
    });
  }

  /** Send a context update without triggering a model response. */
  sendContext(text: string): void {
    this.send({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: false,
      },
    });
  }

  /** Send text that triggers a model response. */
  sendText(text: string): void {
    this.send({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    });
  }

  /** Tear down the connection and all timers. */
  disconnect(): void {
    this.stopKeepalive();
    this.lastConfig = null;
    this.goAwayReceived = false;
    this.reconnectAttempts = 0;

    if (this.ws) {
      // Remove listeners before closing to avoid the close handler
      // from firing an error when we intentionally disconnect.
      const ws = this.ws;
      this.ws = null;

      try {
        ws.close(1000, 'Client disconnect');
      } catch {
        // WebSocket may already be closed — ignore.
      }
    }

    this.setStatus('idle');
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private setStatus(status: SessionStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.callbacks.onStatusChange?.(status);
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private sendSetup(systemInstruction: string, voice: GeminiVoice): void {
    this.send({
      setup: {
        model: MODEL,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
            endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
            silenceDurationMs: 300,
          },
        },
      },
    });
  }

  private handleMessage(event: MessageEvent): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      // Non-JSON frames are ignored.
      return;
    }

    // 1. Setup acknowledgement
    if (msg.setupComplete !== undefined) {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      return;
    }

    // GoAway — the server wants us to reconnect; the close handler follows.
    if (msg.goAway !== undefined) {
      this.goAwayReceived = true;
      return;
    }

    // 2. Streaming content from the model
    const content = msg.serverContent;
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
