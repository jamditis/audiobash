/**
 * ElevenLabs Scribe v2 real-time WebSocket service.
 * Provides streaming speech-to-text with VAD-based auto-commit.
 */

import { transcriptionLog as log } from '../utils/logger';

export interface ElevenLabsRealtimeConfig {
  apiKey: string;
  language?: string;
  keyterms?: string[];
  onFinalTranscript: (text: string) => void;
  onError: (error: Error) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

export interface ElevenLabsRealtimeError extends Error {
  code: string;
}

type MessageType =
  | 'session_started'
  | 'partial_transcript'
  | 'committed_transcript'
  | 'committed_transcript_with_timestamps'
  | 'error';

interface ServerMessage {
  message_type: MessageType;
  text?: string;
}

export const REALTIME_CONNECT_TIMEOUT_MS = 30_000;
export const REALTIME_MAX_CONNECT_ATTEMPTS = 3;
export const REALTIME_RETRY_DELAYS_MS = [1_000, 2_000] as const;

function cancellationError(reason?: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }

  const error = new Error('ElevenLabs connection canceled');
  error.name = 'AbortError';
  return error;
}

function setupError(): ElevenLabsRealtimeError {
  const error = new Error('ElevenLabs real-time setup failed') as ElevenLabsRealtimeError;
  error.code = 'ELEVENLABS_REALTIME_SETUP_FAILED';
  return error;
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(cancellationError(signal.reason));
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);

    const handleAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', handleAbort);
      reject(cancellationError(signal.reason));
    };

    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

export class ElevenLabsRealtimeService {
  private ws: WebSocket | null = null;
  private config: ElevenLabsRealtimeConfig;
  private connectPromise: Promise<void> | null = null;
  private setupController: AbortController | null = null;
  private generation = 0;
  private manuallyDisconnected = false;

  constructor(config: ElevenLabsRealtimeConfig) {
    this.config = config;
  }

  /** Connect to the ElevenLabs real-time WebSocket endpoint. */
  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.manuallyDisconnected = false;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.setupController = controller;

    const connection = this.connectWithRetries(generation, controller.signal)
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          this.manuallyDisconnected ||
          generation !== this.generation
        ) {
          throw cancellationError(controller.signal.reason ?? error);
        }

        log.error('ElevenLabs real-time setup failed');
        throw setupError();
      })
      .finally(() => {
        if (this.connectPromise === connection) {
          this.connectPromise = null;
        }
        if (this.setupController === controller) {
          this.setupController = null;
        }
      });

    this.connectPromise = connection;
    return connection;
  }

  private async connectWithRetries(generation: number, signal: AbortSignal): Promise<void> {
    let latestError: unknown;

    for (let attempt = 0; attempt < REALTIME_MAX_CONNECT_ATTEMPTS; attempt += 1) {
      try {
        await this.connectOnce(generation, signal);
        return;
      } catch (error) {
        latestError = error;

        if (signal.aborted || generation !== this.generation) {
          throw cancellationError(signal.reason ?? error);
        }

        const retryDelay = REALTIME_RETRY_DELAYS_MS[attempt];
        if (retryDelay === undefined) {
          break;
        }

        log.info('Retrying ElevenLabs real-time setup', {
          attempt: attempt + 2,
          maxAttempts: REALTIME_MAX_CONNECT_ATTEMPTS,
          delayMs: retryDelay,
        });
        await abortableDelay(retryDelay, signal);
      }
    }

    throw latestError instanceof Error
      ? latestError
      : new Error('ElevenLabs real-time setup failed');
  }

  private connectOnce(generation: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted || generation !== this.generation) {
      return Promise.reject(cancellationError(signal.reason));
    }

    const url = this.createConnectionUrl();
    log.info('Connecting to ElevenLabs real-time', {
      endpoint: url.origin + url.pathname,
      language: this.config.language || 'auto',
      keytermsCount: this.config.keyterms?.length || 0,
    });

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url.toString());
      this.ws = socket;
      let settled = false;

      const isCurrentSocket = () => this.ws === socket && generation === this.generation;

      const clearSetup = () => {
        clearTimeout(connectionTimeout);
        signal.removeEventListener('abort', handleAbort);
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
      };

      const fail = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearSetup();
        if (this.ws === socket) {
          this.ws = null;
        }
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
        reject(error);
      };

      const handleAbort = () => {
        fail(cancellationError(signal.reason));
      };

      const connectionTimeout = setTimeout(() => {
        fail(new Error('ElevenLabs real-time connection timeout'));
      }, REALTIME_CONNECT_TIMEOUT_MS);

      socket.onopen = () => {
        if (!isCurrentSocket()) {
          fail(cancellationError());
          return;
        }

        settled = true;
        clearSetup();
        this.installConnectedHandlers(socket, generation);
        log.info('ElevenLabs real-time WebSocket connected');
        resolve();
      };

      socket.onerror = () => {
        fail(new Error('ElevenLabs real-time connection failed before opening'));
      };

      socket.onclose = () => {
        fail(new Error('ElevenLabs real-time connection closed before opening'));
      };

      signal.addEventListener('abort', handleAbort, { once: true });
    });
  }

  private createConnectionUrl(): URL {
    const url = new URL('wss://api.elevenlabs.io/v1/speech-to-text/realtime');
    url.searchParams.set('model_id', 'scribe_v2_realtime');
    url.searchParams.set('audio_format', 'pcm_16000');
    url.searchParams.set('commit_strategy', 'vad');
    url.searchParams.set('include_timestamps', 'false');

    if (this.config.language) {
      url.searchParams.set('language_code', this.config.language);
    }

    if (this.config.keyterms?.length) {
      url.searchParams.set('keyterms', JSON.stringify(this.config.keyterms.slice(0, 100)));
    }

    url.searchParams.set('xi-api-key', this.config.apiKey);
    return url;
  }

  private installConnectedHandlers(socket: WebSocket, generation: number): void {
    socket.onmessage = (event) => {
      if (this.ws === socket && this.generation === generation) {
        this.handleMessage(event.data);
      }
    };

    socket.onerror = () => {
      if (this.ws === socket && this.generation === generation) {
        log.error('ElevenLabs real-time WebSocket error');
      }
    };

    socket.onclose = (event) => {
      if (this.ws !== socket || this.generation !== generation) {
        return;
      }

      this.ws = null;
      log.info('ElevenLabs real-time WebSocket closed', {
        code: event.code,
        wasClean: event.wasClean,
      });

      if (this.manuallyDisconnected || event.wasClean) {
        this.notifySessionEnd();
        return;
      }

      const reconnect = () => {
        if (!this.manuallyDisconnected && generation === this.generation && !this.ws) {
          void this.connect().catch((error: unknown) => {
            if (this.manuallyDisconnected) {
              return;
            }
            this.notifyError(error instanceof Error ? error : setupError());
            this.disconnect();
            this.notifySessionEnd();
          });
        }
      };
      const pendingSetup = this.connectPromise;
      if (pendingSetup) {
        void pendingSetup.then(reconnect, reconnect);
      } else {
        queueMicrotask(reconnect);
      }
    };
  }

  private handleMessage(data: string): void {
    try {
      const message: ServerMessage = JSON.parse(data);

      switch (message.message_type) {
        case 'session_started':
          log.info('ElevenLabs session started');
          this.notifySessionStart();
          break;

        case 'partial_transcript':
          log.debug('Partial transcript received', { textLength: message.text?.length || 0 });
          break;

        case 'committed_transcript':
        case 'committed_transcript_with_timestamps': {
          const text = message.text?.trim() || '';
          if (text) {
            log.info('Final transcript received', { textLength: text.length });
            this.notifyFinalTranscript(text);
          }
          break;
        }

        case 'error': {
          const error = new Error(
            'ElevenLabs real-time transcription failed',
          ) as ElevenLabsRealtimeError;
          error.code = 'ELEVENLABS_REALTIME_ERROR';
          log.error('ElevenLabs real-time transcription failed');
          this.notifyError(error);
          this.disconnect();
          break;
        }

        default:
          log.debug('Unknown ElevenLabs message type received');
      }
    } catch {
      log.error('Failed to process ElevenLabs WebSocket message');
    }
  }

  /** Send base64-encoded, 16-bit PCM audio at 16 kHz. */
  sendAudio(pcmBase64: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn('Cannot send audio: WebSocket not connected');
      return;
    }

    this.ws.send(
      JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: pcmBase64,
        commit: false,
        sample_rate: 16000,
      }),
    );
  }

  /** Commit the current server-side audio buffer. */
  commit(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn('Cannot commit: WebSocket not connected');
      return;
    }

    this.ws.send(
      JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: '',
        commit: true,
        sample_rate: 16000,
      }),
    );
  }

  /** Cancel setup or close the active WebSocket. */
  disconnect(): void {
    this.manuallyDisconnected = true;
    this.generation += 1;

    const socket = this.ws;
    const wasConnected = socket?.readyState === WebSocket.OPEN;
    this.ws = null;

    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close(1000, 'User disconnect');
    }

    this.setupController?.abort(cancellationError());
    this.setupController = null;

    if (wasConnected) {
      this.notifySessionEnd();
    }
  }

  private notifyError(error: Error): void {
    try {
      this.config.onError(error);
    } catch {
      log.error('ElevenLabs real-time error callback failed');
    }
  }

  private notifyFinalTranscript(text: string): void {
    try {
      this.config.onFinalTranscript(text);
    } catch {
      log.error('ElevenLabs final-transcript callback failed');
    }
  }

  private notifySessionStart(): void {
    try {
      this.config.onSessionStart?.();
    } catch {
      log.error('ElevenLabs session-start callback failed');
    }
  }

  private notifySessionEnd(): void {
    try {
      this.config.onSessionEnd?.();
    } catch {
      log.error('ElevenLabs real-time session-end callback failed');
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  updateConfig(newConfig: Partial<ElevenLabsRealtimeConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
