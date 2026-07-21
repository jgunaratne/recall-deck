// Browser-side audio recorder — captures microphone as PCM mono Int16 base64 chunks.
// Based on the Hansel project pattern for Gemini Live integration.

import { MICROPHONE_INPUT_STORAGE_KEY } from './audio-input';

const SAMPLE_RATE = 16_000;
const BUFFER_SIZE = 4096;

/** Convert Float32 PCM samples to Int16 PCM samples. */
export function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return int16Array;
}

/** Encode an ArrayBuffer to a base64 string. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Linear-interpolation downsample. Gemini Live requires 16 kHz input; if the
 * browser refuses to run the AudioContext at 16 kHz (Safari, some hardware),
 * the captured audio would otherwise be sent at the wrong rate — the API
 * would "hear" slowed-down rumble and never detect speech.
 */
export function downsample(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const next = idx + 1 < input.length ? input[idx + 1] : input[idx];
    out[i] = input[idx] * (1 - frac) + next * frac;
  }
  return out;
}

export class AudioRecorder {
  constructor(private readonly targetSampleRate = SAMPLE_RATE) {}

  private _audioContext: AudioContext | null = null;
  private _stream: MediaStream | null = null;
  private _sourceNode: MediaStreamAudioSourceNode | null = null;
  private _processorNode: ScriptProcessorNode | null = null;
  private _gainNode: GainNode | null = null;
  private _analyser: AnalyserNode | null = null;
  private _isRecording = false;

  /** Whether the recorder is currently capturing audio. */
  get isRecording(): boolean {
    return this._isRecording;
  }

  /** AnalyserNode for visualization — available after `start()`. */
  get analyserNode(): AnalyserNode | null {
    return this._analyser;
  }

  /**
 * Begin recording from the user's microphone. Each captured chunk is
 * converted to Int16 PCM at the configured target rate and delivered as a
 * base64 string via the `onData` callback.
   */
  async start(onData: (base64: string) => void): Promise<void> {
    if (this._isRecording) return;

    try {
      // Create the context first, while the user-gesture activation that
      // triggered this call is still fresh — getUserMedia may show a
      // permission prompt that outlives the activation window.
      try {
        this._audioContext = new AudioContext({ sampleRate: this.targetSampleRate });
      } catch {
      // Some browsers reject a forced sample rate; capture at the native
        // rate and downsample per-chunk instead.
        this._audioContext = new AudioContext();
      }

      // Autoplay policy can leave the context suspended. A suspended context
      // never fires onaudioprocess, so the mic would look live (red button,
      // permission granted) while sending nothing at all.
      if (this._audioContext.state !== 'running') {
        await this._audioContext.resume();
      }
      if ((this._audioContext.state as string) !== 'running') {
        throw new Error('Audio capture could not start — try clicking the mic again');
      }

      const microphoneInputId = window.localStorage.getItem(MICROPHONE_INPUT_STORAGE_KEY);
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(microphoneInputId ? { deviceId: { exact: microphoneInputId } } : {}),
          sampleRate: this.targetSampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this._sourceNode = this._audioContext.createMediaStreamSource(this._stream);

      // Analyser for visualization (e.g. volume meters)
      this._analyser = this._audioContext.createAnalyser();
      this._analyser.fftSize = 256;
      this._sourceNode.connect(this._analyser);

      // ScriptProcessor to capture raw PCM data
      this._processorNode = this._audioContext.createScriptProcessor(
        BUFFER_SIZE,
        1, // mono input
        1, // mono output
      );

      const contextRate = this._audioContext.sampleRate;
      this._processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this._isRecording) return;
        const inputData = event.inputBuffer.getChannelData(0);
        const resampled = downsample(inputData, contextRate, this.targetSampleRate);
        const int16Data = float32ToInt16(resampled);
        const base64 = arrayBufferToBase64(int16Data.buffer as ArrayBuffer);
        onData(base64);
      };

      // Silent gain node — prevents raw mic audio from playing through speakers
      this._gainNode = this._audioContext.createGain();
      this._gainNode.gain.value = 0;

      // Wire: source → processor → silent gain → destination
      this._sourceNode.connect(this._processorNode);
      this._processorNode.connect(this._gainNode);
      this._gainNode.connect(this._audioContext.destination);

      this._isRecording = true;
    } catch (err) {
      // Don't leak a half-built audio graph (open mic track, running context)
      this.stop();
      throw err;
    }
  }

  /** Stop recording and release all resources. */
  stop(): void {
    this._isRecording = false;

    if (this._processorNode) {
      this._processorNode.onaudioprocess = null;
      this._processorNode.disconnect();
      this._processorNode = null;
    }

    if (this._gainNode) {
      this._gainNode.disconnect();
      this._gainNode = null;
    }

    if (this._sourceNode) {
      this._sourceNode.disconnect();
      this._sourceNode = null;
    }

    if (this._analyser) {
      this._analyser.disconnect();
      this._analyser = null;
    }

    if (this._stream) {
      for (const track of this._stream.getTracks()) {
        track.stop();
      }
      this._stream = null;
    }

    if (this._audioContext) {
      void this._audioContext.close();
      this._audioContext = null;
    }
  }
}
