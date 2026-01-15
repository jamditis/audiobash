/**
 * Core WebSocket connection hook with auto-reconnection
 * Handles low-level WebSocket operations with exponential backoff
 */

import { useRef, useState, useCallback, useEffect } from 'react';

export interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface UseWebSocketReturn {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  send: (data: unknown) => void;
  sendBinary: (data: ArrayBuffer | Blob) => void;
  disconnect: () => void;
  reconnect: () => void;
}

// Exponential backoff constants
const BASE_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const BACKOFF_MULTIPLIER = 1.5;

/**
 * Low-level WebSocket hook with reconnection and state management
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnect: shouldReconnect = true,
    reconnectInterval = BASE_RECONNECT_DELAY,
    maxReconnectAttempts = 10,
  } = options;

  // State
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for stable references across renders
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const currentDelayRef = useRef(reconnectInterval);
  const intentionalDisconnectRef = useRef(false);
  const mountedRef = useRef(true);

  // Store callbacks in refs to avoid dependency issues
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  // Update callback refs when they change
  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [onMessage, onConnect, onDisconnect, onError]);

  /**
   * Clear any pending reconnection timeout
   */
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  /**
   * Calculate next reconnect delay with exponential backoff
   */
  const getNextReconnectDelay = useCallback(() => {
    const delay = currentDelayRef.current;
    // Increase delay for next attempt, capped at max
    currentDelayRef.current = Math.min(
      delay * BACKOFF_MULTIPLIER,
      MAX_RECONNECT_DELAY
    );
    return delay;
  }, []);

  /**
   * Reset reconnection state
   */
  const resetReconnectState = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    currentDelayRef.current = reconnectInterval;
    clearReconnectTimeout();
  }, [reconnectInterval, clearReconnectTimeout]);

  /**
   * Create and connect WebSocket
   */
  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN || connecting) {
      return;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (!mountedRef.current) return;

    setConnecting(true);
    setError(null);
    intentionalDisconnectRef.current = false;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }

        setConnected(true);
        setConnecting(false);
        setError(null);
        resetReconnectState();

        onConnectRef.current?.();
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;

        try {
          // Handle text messages (JSON)
          if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);
            onMessageRef.current?.(data);
          } else {
            // Binary data - pass through as-is
            onMessageRef.current?.(event.data);
          }
        } catch (parseError) {
          console.error('[useWebSocket] Failed to parse message:', parseError);
          // Still pass raw data if JSON parse fails
          onMessageRef.current?.(event.data);
        }
      };

      ws.onerror = (event: Event) => {
        if (!mountedRef.current) return;

        console.error('[useWebSocket] WebSocket error:', event);
        setError('Connection error');
        onErrorRef.current?.(event);
      };

      ws.onclose = (event: CloseEvent) => {
        if (!mountedRef.current) return;

        setConnected(false);
        setConnecting(false);

        onDisconnectRef.current?.();

        // Attempt reconnection if enabled and not intentional disconnect
        if (
          shouldReconnect &&
          !intentionalDisconnectRef.current &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          const delay = getNextReconnectDelay();
          reconnectAttemptsRef.current++;

          console.log(
            `[useWebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && !intentionalDisconnectRef.current) {
              connect();
            }
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
        }
      };
    } catch (err) {
      if (!mountedRef.current) return;

      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      setConnecting(false);
      console.error('[useWebSocket] Failed to create WebSocket:', err);
    }
  }, [
    url,
    connecting,
    shouldReconnect,
    maxReconnectAttempts,
    resetReconnectState,
    getNextReconnectDelay,
  ]);

  /**
   * Send JSON data through WebSocket
   */
  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(data));
      } catch (err) {
        console.error('[useWebSocket] Failed to send message:', err);
      }
    } else {
      console.warn('[useWebSocket] Cannot send - WebSocket not connected');
    }
  }, []);

  /**
   * Send binary data through WebSocket
   */
  const sendBinary = useCallback((data: ArrayBuffer | Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(data);
      } catch (err) {
        console.error('[useWebSocket] Failed to send binary data:', err);
      }
    } else {
      console.warn('[useWebSocket] Cannot send binary - WebSocket not connected');
    }
  }, []);

  /**
   * Intentionally disconnect WebSocket
   */
  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    clearReconnectTimeout();
    resetReconnectState();

    if (wsRef.current) {
      // Send disconnect message before closing (if connected)
      if (wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'disconnect' }));
        } catch {
          // Ignore send errors during disconnect
        }
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);
    setConnecting(false);
  }, [clearReconnectTimeout, resetReconnectState]);

  /**
   * Manually trigger reconnection
   */
  const manualReconnect = useCallback(() => {
    intentionalDisconnectRef.current = false;
    resetReconnectState();
    connect();
  }, [connect, resetReconnectState]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      intentionalDisconnectRef.current = true;
      clearReconnectTimeout();

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clearReconnectTimeout]);

  return {
    connected,
    connecting,
    error,
    send,
    sendBinary,
    disconnect,
    reconnect: manualReconnect,
  };
}

export default useWebSocket;
