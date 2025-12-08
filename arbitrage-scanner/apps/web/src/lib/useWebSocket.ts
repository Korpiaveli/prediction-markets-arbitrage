import { useEffect, useState, useRef } from 'react';

const getWsUrl = () => {
  if (typeof window === 'undefined') return '';
  return process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';
};

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const WS_URL = getWsUrl();
    if (!WS_URL) return;

    function connect() {
      try {
        console.log('[WebSocket] Connecting to:', WS_URL);
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[WebSocket] Connected successfully');
          setConnected(true);
          setError(null);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('[WebSocket] Message received:', message.type);
            setLastMessage(message);
          } catch (err) {
            console.error('[WebSocket] Failed to parse message:', err);
          }
        };

        ws.onerror = (event) => {
          console.error('[WebSocket] Connection error:', event);
          setError('WebSocket connection failed');
          setConnected(false);
        };

        ws.onclose = (event) => {
          console.log('[WebSocket] Disconnected. Code:', event.code, 'Reason:', event.reason);
          setConnected(false);

          // Attempt to reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[WebSocket] Attempting to reconnect...');
            connect();
          }, 5000);
        };
      } catch (err) {
        console.error('[WebSocket] Failed to create connection:', err);
        setError('Failed to initialize WebSocket');
      }
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const send = (data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  return { connected, lastMessage, send, error };
}
