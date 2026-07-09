// Browser-side audio player — plays PCM 24 kHz mono Int16 chunks from Gemini Live.
// Queue-based sequential playback with start-of-turn jitter buffering.

const PLAYBACK_SAMPLE_RATE = 24_000;
const MAKEUP_GAIN = 1.5;
const JITTER_BUFFER_MS = 200;

/** Decode a base64 string to an ArrayBuffer. */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Convert Int16 PCM samples to Float32 PCM samples (range -1..1). */
function int16ToFloat32(int16Array: Int16Array): Float32Array {
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 0x8000;
  }
  return float32Array;
}

export class AudioPlayer {
  private _audioContext: AudioContext | null = null;
  private _gainNode: GainNode | null = null;
  private _queue: AudioBuffer[] = [];
  private _isPlaying = false;
  private _currentSource: AudioBufferSourceNode | null = null;
  private _jitterTimer: ReturnType<typeof setTimeout> | null = null;
  private _isTurnStarted = false;

  /** Called when the first chunk of a turn begins playing through speakers. */
  onPlaybackStart: (() => void) | null = null;

  /** Called when the queue is fully drained and playback has ended. */
  onPlaybackEnd: (() => void) | null = null;

  /** Whether audio is currently playing. */
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /** Mute/unmute — silences output without stopping the queue. */
  private _muted = false;
  get muted(): boolean {
    return this._muted;
  }
  set muted(value: boolean) {
    this._muted = value;
    if (this._gainNode) {
      this._gainNode.gain.value = value ? 0 : MAKEUP_GAIN;
    }
  }

  /** Ensure the AudioContext and gain node are initialised. */
  private _ensureContext(): AudioContext {
    if (!this._audioContext) {
      this._audioContext = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
      this._gainNode = this._audioContext.createGain();
      this._gainNode.gain.value = MAKEUP_GAIN;
      this._gainNode.connect(this._audioContext.destination);
    }
    return this._audioContext;
  }

  /**
   * Enqueue a base64-encoded PCM Int16 chunk for playback.
   * On the first chunk of a new turn, waits 200 ms (jitter buffer)
   * before starting playback so that a few chunks can accumulate.
   */
  playChunk(base64Data: string): void {
    const ctx = this._ensureContext();

    // Decode base64 → Int16 → Float32
    const rawBuffer = base64ToArrayBuffer(base64Data);
    const int16Samples = new Int16Array(rawBuffer);
    const float32Samples = int16ToFloat32(int16Samples);

    // Wrap in an AudioBuffer
    const audioBuffer = ctx.createBuffer(1, float32Samples.length, PLAYBACK_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32Samples);

    this._queue.push(audioBuffer);

    if (!this._isTurnStarted) {
      // First chunk of a new turn — start jitter buffer countdown
      this._isTurnStarted = true;
      this._jitterTimer = setTimeout(() => {
        this._jitterTimer = null;
        this._playNext();
      }, JITTER_BUFFER_MS);
    } else if (!this._isPlaying && this._jitterTimer === null) {
      // Already past jitter phase — play immediately if idle
      this._playNext();
    }
  }

  /** Play the next queued buffer. */
  private _playNext(): void {
    const ctx = this._audioContext;
    if (!ctx || !this._gainNode) return;

    const buffer = this._queue.shift();
    if (!buffer) {
      // Queue drained — turn is complete
      this._isPlaying = false;
      this._isTurnStarted = false;
      this._currentSource = null;
      this.onPlaybackEnd?.();
      return;
    }

    if (!this._isPlaying) {
      this._isPlaying = true;
      this.onPlaybackStart?.();
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this._gainNode);

    source.onended = () => {
      this._playNext();
    };

    this._currentSource = source;
    source.start();
  }

  /**
   * Barge-in: drop the current source and queued buffers but keep the
   * AudioContext alive so the model's next turn starts instantly.
   */
  flush(): void {
    if (this._jitterTimer !== null) {
      clearTimeout(this._jitterTimer);
      this._jitterTimer = null;
    }

    if (this._currentSource) {
      // Detach onended first so stopping doesn't chain into _playNext.
      this._currentSource.onended = null;
      try {
        this._currentSource.stop();
      } catch {
        // Already stopped — ignore
      }
      this._currentSource = null;
    }

    this._queue.length = 0;
    this._isPlaying = false;
    this._isTurnStarted = false;
    this.onPlaybackEnd?.();
  }

  /** Stop all playback, clear the queue, and reset state. */
  stop(): void {
    if (this._jitterTimer !== null) {
      clearTimeout(this._jitterTimer);
      this._jitterTimer = null;
    }

    if (this._currentSource) {
      try {
        this._currentSource.stop();
      } catch {
        // Already stopped — ignore
      }
      this._currentSource = null;
    }

    this._queue.length = 0;
    this._isPlaying = false;
    this._isTurnStarted = false;

    if (this._audioContext) {
      void this._audioContext.close();
      this._audioContext = null;
      this._gainNode = null;
    }

    this.onPlaybackEnd?.();
  }
}
