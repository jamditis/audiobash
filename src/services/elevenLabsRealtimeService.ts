/**
 * ElevenLabs Scribe v2 Real-time WebSocket Service
 * Provides streaming speech-to-text with VAD-based auto-commit
 */

import { transcriptionLog as log } from '../utils/logger';

export interface ElevenLabsRealtimeConfig {
  apiKey: string;
  language?: string;           // 'eng' or null for auto-detect
  keyterms?: string[];         // Up to 100 vocabulary terms for better accuracy
  onFinalTranscript: (text: string) => void;
  onError: (error: Error) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

export interface ElevenLabsRealtimeError extends Error {
  code: string;
  type?: string;
}

type MessageType =
  | 'session_started'
  | 'partial_transcript'
  | 'committed_transcript'
  | 'committed_transcript_with_timestamps'
  | 'error';

interface ServerMessage {
  message_type: MessageType;
  session_id?: string;
  text?: string;
  error_message?: string;
  error_type?: string;
  language_code?: string;
  words?: Array<{
    text: string;
    start: number;
    end: number;
    type: string;
    logprob: number;
  }>;
}

export class ElevenLabsRealtimeService {
  private ws: WebSocket | null = null;
  private config: ElevenLabsRealtimeConfig;
  private sessionId: string = '';
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private reconnectDelay: number = 1000;

  constructor(config: ElevenLabsRealtimeConfig) {
    this.config = config;
  }

  /**
   * Connect to ElevenLabs real-time WebSocket endpoint
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      log.debug('WebSocket already connected');
      return;
    }

    if (this.isConnecting) {
      log.debug('WebSocket connection already in progress');
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        // Build WebSocket URL with query parameters
        const url = new URL('wss://api.elevenlabs.io/v1/speech-to-text/realtime');
        url.searchParams.set('model_id', 'scribe_v1');
        url.searchParams.set('audio_format', 'pcm_16000');
        url.searchParams.set('commit_strategy', 'vad');
        url.searchParams.set('include_timestamps', 'false');

        if (this.config.language) {
          url.searchParams.set('language_code', this.config.language);
        }

        // Add keyterms if provided (max 100)
        if (this.config.keyterms && this.config.keyterms.length > 0) {
          const keyterms = this.config.keyterms.slice(0, 100);
          url.searchParams.set('keyterms', JSON.stringify(keyterms));
        }

        log.info('Connecting to ElevenLabs real-time', {
          endpoint: url.origin + url.pathname,
          language: this.config.language || 'auto',
          keytermsCount: this.config.keyterms?.length || 0,
        });

        this.ws = new WebSocket(url.toString(), {
          // @ts-ignore - headers supported in some WebSocket implementations
          headers: {
            'xi-api-key': this.config.apiKey,
          },
        });

        // For browser WebSocket, we need to handle auth differently
        // The xi-api-key header may not work in all browsers, so we also support
        // passing it as a query param (less secure but more compatible)
        if (typeof window !== 'undefined') {
          // Close and reconnect with token in query string for browser compatibility
          this.ws.close();
          url.searchParams.set('xi-api-key', this.config.apiKey);
          this.ws = new WebSocket(url.toString());
        }

        const connectionTimeout = setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.ws?.close();
            this.isConnecting = false;
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          log.info('WebSocket connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (event) => {
          clearTimeout(connectionTimeout);
          log.error('WebSocket error', event);
          this.isConnecting = false;
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          log.info('WebSocket closed', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });

          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          } else {
            this.config.onSessionEnd?.();
          }
        };
      } catch (error) {
        this.isConnecting = false;
        log.error('Failed to create WebSocket', error);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message: ServerMessage = JSON.parse(data);

      switch (message.message_type) {
        case 'session_started':
          this.sessionId = message.session_id || '';
          log.info('ElevenLabs session started', { sessionId: this.sessionId });
          this.config.onSessionStart?.();
          break;

        case 'partial_transcript':
          // We're not displaying partial transcripts per user preference
          // but we still log them for debugging
          log.debug('Partial transcript', { text: message.text });
          break;

        case 'committed_transcript':
        case 'committed_transcript_with_timestamps':
          const text = message.text?.trim() || '';
          if (text) {
            log.info('Final transcript received', { textLength: text.length });
            this.config.onFinalTranscript(text);
          }
          break;

        case 'error':
          const error = new Error(message.error_message || 'Unknown ElevenLabs error') as ElevenLabsRealtimeError;
          error.code = message.error_type || 'UNKNOWN';
          error.type = message.error_type;
          log.error('ElevenLabs error', error, { errorType: message.error_type });
          this.config.onError(error);
          break;

        default:
          log.debug('Unknown message type', { type: message.message_type });
      }
    } catch (error) {
      log.error('Failed to parse WebSocket message', error);
    }
  }

  /**
   * Send PCM audio data to the WebSocket
   * @param pcmBase64 Base64-encoded PCM 16-bit audio at 16kHz
   */
  sendAudio(pcmBase64: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn('Cannot send audio: WebSocket not connected');
      return;
    }

    const message = {
      message_type: 'input_audio_chunk',
      audio_base_64: pcmBase64,
      commit: false,
      sample_rate: 16000,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Force commit the current audio buffer (manual stop)
   */
  commit(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn('Cannot commit: WebSocket not connected');
      return;
    }

    log.debug('Sending manual commit');

    // Send a commit message to finalize the current audio
    const message = {
      message_type: 'input_audio_chunk',
      audio_base_64: '',
      commit: true,
      sample_rate: 16000,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
    if (this.ws) {
      log.info('Disconnecting WebSocket');
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
    }
    this.sessionId = '';
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current session ID
   */
  get currentSessionId(): string {
    return this.sessionId;
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    log.info('Attempting reconnect', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delayMs: delay,
    });

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect();
    } catch (error) {
      log.error('Reconnect failed', error);
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.config.onError(new Error('Failed to reconnect after multiple attempts'));
        this.config.onSessionEnd?.();
      }
    }
  }

  /**
   * Update configuration (e.g., keyterms) - requires reconnect
   */
  updateConfig(newConfig: Partial<ElevenLabsRealtimeConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
