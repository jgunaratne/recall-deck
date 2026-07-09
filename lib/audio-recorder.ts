// Browser-side audio recorder — captures microphone as PCM 16kHz mono Int16 base64 chunks.
// Based on the Hansel project pattern for Gemini Live integration.

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

export class AudioRecorder {
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
   * Begin recording from the user's microphone.
   * Each captured chunk is converted to Int16 PCM at 16 kHz and delivered
   * as a base64 string via the `onData` callback.
   */
  async start(onData: (base64: string) => void): Promise<void> {
    if (this._isRecording) return;

    this._audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
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

    this._processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this._isRecording) return;
      const inputData = event.inputBuffer.getChannelData(0);
      const int16Data = float32ToInt16(inputData);
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
