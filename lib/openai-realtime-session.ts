import type { RealtimeServerEvent } from 'openai/resources/realtime/realtime';

export type OpenAIRealtimeStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface OpenAIRealtimeCallbacks {
  onStatusChange?: (status: OpenAIRealtimeStatus) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
  onInterrupted?: () => void;
  onInputTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
}

export interface OpenAIRealtimeConfig {
  clientSecret: string;
}

const CONNECT_TIMEOUT_MS = 15_000;
const REALTIME_URL = 'https://api.openai.com/v1/realtime/calls';

type PendingResponse =
  | { type: 'text'; text: string }
  | { type: 'audio' };

function describeRealtimeError(message: string): string {
  if (/conversation already has an active response in progress/i.test(message)) {
    return 'The tutor is still completing its previous response. Please try again in a moment.';
  }
  return message;
}

export class OpenAIRealtimeSession {
  private _status: OpenAIRealtimeStatus = 'idle';
  private readonly callbacks: OpenAIRealtimeCallbacks;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private audioSender: RTCRtpSender | null = null;
  private placeholderAudioContext: AudioContext | null = null;
  private placeholderOscillator: OscillatorNode | null = null;
  private microphoneStream: MediaStream | null = null;
  private pendingEvents: string[] = [];
  private connectEpoch = 0;
  private responseActive = false;
  private audioOutputActive = false;
  private pendingResponse: PendingResponse | null = null;
  private responseCancellationPending = false;

  constructor(callbacks: OpenAIRealtimeCallbacks) {
    this.callbacks = callbacks;
  }

  get status(): OpenAIRealtimeStatus {
    return this._status;
  }

  get micEnabled(): boolean {
    return !!this.microphoneStream;
  }

  async connect(config: OpenAIRealtimeConfig): Promise<void> {
    this.disconnect();
    this.setStatus('connecting');
    const epoch = ++this.connectEpoch;

    try {
      const pc = new RTCPeerConnection();
      this.peerConnection = pc;

      const audioElement = new Audio();
      audioElement.autoplay = true;
      this.audioElement = audioElement;

      pc.ontrack = (event) => {
        if (epoch !== this.connectEpoch) return;
        audioElement.srcObject = event.streams[0];
        void audioElement.play().catch(() => {
          this.callbacks.onError?.('Click mute/unmute once to start audio playback.');
        });
      };

      // The Realtime WebRTC offer must include an outbound audio track. Keep a
      // silent track negotiated from the start, then replace it with the mic
      // when the learner opens Ask Question.
      const placeholderTrack = this.createPlaceholderAudioTrack();
      this.audioSender = pc.addTrack(placeholderTrack);

      const dc = pc.createDataChannel('oai-events');
      this.dataChannel = dc;
      dc.onopen = () => {
        if (epoch !== this.connectEpoch) return;
        this.flushPendingEvents();
        this.setStatus('connected');
      };
      dc.onmessage = (event) => this.handleServerEvent(event.data);
      dc.onerror = () => this.handleError('OpenAI Realtime data channel error');
      dc.onclose = () => {
        if (epoch !== this.connectEpoch) return;
        if (this._status === 'connected' || this._status === 'connecting') {
          this.setStatus('idle');
          this.callbacks.onSpeakingChange?.(false);
        }
      };

      pc.onconnectionstatechange = () => {
        if (epoch !== this.connectEpoch) return;
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          this.callbacks.onSpeakingChange?.(false);
          if (this._status !== 'idle') this.setStatus('error');
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!offer.sdp) throw new Error('Failed to create WebRTC offer');

      const sdpResponse = await Promise.race([
        fetch(REALTIME_URL, {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${config.clientSecret}`,
            'Content-Type': 'application/sdp',
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)),
            CONNECT_TIMEOUT_MS,
          ),
        ),
      ]);

      if (!sdpResponse.ok) {
        const detail = await sdpResponse.text().catch(() => '');
        throw new Error(detail || 'OpenAI Realtime session failed');
      }

      const answerSdp = await sdpResponse.text();
      if (epoch !== this.connectEpoch) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'Failed to connect');
    }
  }

  setMuted(muted: boolean): void {
    if (this.audioElement) {
      this.audioElement.muted = muted;
    }
  }

  async enableMicrophone(): Promise<void> {
    if (this._status !== 'connected' || !this.audioSender) return;
    if (this.microphoneStream) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('No microphone track available');
    }

    await this.audioSender.replaceTrack(track);
    this.microphoneStream = stream;
  }

  async disableMicrophone(): Promise<void> {
    const stream = this.microphoneStream;
    this.microphoneStream = null;
    if (!stream) return;

    for (const track of stream.getTracks()) {
      track.enabled = false;
    }

    const sender = this.audioSender;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
    try {
      await sender?.replaceTrack(null);
    } catch {
      // The peer connection may close while the microphone is detaching.
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  sendContext(text: string): void {
    this.sendConversationItem(text);
  }

  sendText(text: string): void {
    if (this.responseActive) {
      // A Realtime conversation permits only one active response. Keep the
      // latest card request, interrupt the old response, and begin it after
      // the server confirms the cancellation.
      this.pendingResponse = { type: 'text', text };
      this.cancelActiveResponse();
      if (this.audioOutputActive) {
        this.sendEvent({ type: 'output_audio_buffer.clear' });
      }
      this.audioOutputActive = false;
      this.callbacks.onSpeakingChange?.(false);
      return;
    }

    this.startResponse(text);
  }

  /** Interrupt the current narration before the user begins speaking. */
  beginQuestion(): void {
    if (this._status !== 'connected') return;

    this.pendingResponse = null;
    this.sendEvent({ type: 'input_audio_buffer.clear' });
    this.clearOutput();
  }

  /** Send a PCM16 24 kHz microphone chunk over the Realtime data channel. */
  sendAudio(base64Data: string): void {
    if (this._status !== 'connected') return;
    this.sendEvent({ type: 'input_audio_buffer.append', audio: base64Data });
  }

  /** Commit the captured question and start the tutor's audio response. */
  finishQuestion(): void {
    if (this._status !== 'connected') return;

    this.sendEvent({ type: 'input_audio_buffer.commit' });
    if (this.responseActive) {
      this.pendingResponse = { type: 'audio' };
      this.cancelActiveResponse();
      return;
    }
    this.startAudioResponse();
  }

  private startResponse(text: string): void {
    this.sendConversationItem(text);
    this.startAudioResponse();
  }

  private startAudioResponse(): void {
    // Mark this optimistically so rapid card changes cannot create two
    // overlapping responses before the server emits response.created.
    this.responseActive = true;
    this.responseCancellationPending = false;
    this.sendEvent({
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
      },
    });
  }

  clearOutput(): void {
    this.cancelActiveResponse();
    if (this.responseActive || this.audioOutputActive) {
      this.sendEvent({ type: 'output_audio_buffer.clear' });
    }
    this.audioOutputActive = false;
    this.callbacks.onSpeakingChange?.(false);
  }

  disconnect(): void {
    this.connectEpoch += 1;
    this.callbacks.onSpeakingChange?.(false);

    this.disableMicrophone();

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {
        // Already closed.
      }
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {
        // Already closed.
      }
      this.peerConnection = null;
    }

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }

    this.audioSender = null;
    this.placeholderOscillator?.stop();
    this.placeholderOscillator = null;
    void this.placeholderAudioContext?.close();
    this.placeholderAudioContext = null;
    this.pendingEvents = [];
    this.responseActive = false;
    this.audioOutputActive = false;
    this.pendingResponse = null;
    this.responseCancellationPending = false;
    this.setStatus('idle');
  }

  private sendConversationItem(text: string): void {
    this.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text,
          },
        ],
      },
    });
  }

  private createPlaceholderAudioTrack(): MediaStreamTrack {
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0;
    oscillator.connect(gain).connect(destination);
    oscillator.start();

    const track = destination.stream.getAudioTracks()[0];
    if (!track) {
      oscillator.stop();
      void context.close();
      throw new Error('Failed to create an audio track for OpenAI Realtime');
    }

    this.placeholderAudioContext = context;
    this.placeholderOscillator = oscillator;
    return track;
  }

  private sendEvent(event: Record<string, unknown>): void {
    const data = JSON.stringify(event);
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(data);
      return;
    }
    this.pendingEvents.push(data);
  }

  private flushPendingEvents(): void {
    if (this.dataChannel?.readyState !== 'open') return;
    for (const event of this.pendingEvents) {
      this.dataChannel.send(event);
    }
    this.pendingEvents = [];
  }

  private handleServerEvent(raw: string): void {
    let event: RealtimeServerEvent | { type?: string; error?: { message?: string }; message?: string };
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    if (event.type === 'response.created') {
      this.responseActive = true;
      this.callbacks.onSpeakingChange?.(true);
      return;
    }

    if (event.type === 'output_audio_buffer.started') {
      this.audioOutputActive = true;
      this.callbacks.onSpeakingChange?.(true);
      return;
    }

    if (
      event.type === 'output_audio_buffer.stopped' ||
      event.type === 'output_audio_buffer.cleared'
    ) {
      this.audioOutputActive = false;
      this.callbacks.onSpeakingChange?.(false);
      return;
    }

    if (event.type === 'response.done') {
      this.responseActive = false;
      this.responseCancellationPending = false;
      this.callbacks.onSpeakingChange?.(false);
      const pendingResponse = this.pendingResponse;
      this.pendingResponse = null;
      if (pendingResponse) {
        queueMicrotask(() => {
          if (pendingResponse.type === 'text') {
            this.startResponse(pendingResponse.text);
          } else {
            this.startAudioResponse();
          }
        });
      }
      return;
    }

    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      if ('transcript' in event && typeof event.transcript === 'string') {
        this.callbacks.onInputTranscript?.(event.transcript);
      }
      return;
    }

    if (event.type === 'conversation.item.input_audio_transcription.failed') {
      this.callbacks.onError?.(
        event.error?.message || 'OpenAI could not transcribe the recorded question.',
      );
      return;
    }

    if (event.type === 'input_audio_buffer.speech_started') {
      this.callbacks.onInterrupted?.();
      this.audioOutputActive = false;
      this.callbacks.onSpeakingChange?.(false);
      return;
    }

    if (event.type === 'error') {
      const message = 'message' in event ? event.message : undefined;
      this.callbacks.onError?.(
        describeRealtimeError(event.error?.message || message || 'OpenAI Realtime error'),
      );
    }
  }

  private handleError(message: string): void {
    this.setStatus('error');
    this.callbacks.onError?.(message);
  }

  private cancelActiveResponse(): void {
    if (!this.responseActive || this.responseCancellationPending) return;
    this.responseCancellationPending = true;
    this.sendEvent({ type: 'response.cancel' });
  }

  private setStatus(status: OpenAIRealtimeStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.callbacks.onStatusChange?.(status);
  }
}
