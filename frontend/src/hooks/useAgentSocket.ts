import { useEffect, useRef } from 'react';
import { wsUrl } from '../api/client';

export function useAgentSocket(onEvent: (payload: any) => void, enabled: boolean) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(wsUrl('/ws/agent/'));
      socket.onmessage = (ev) => {
        try {
          handler.current(JSON.parse(ev.data));
        } catch {
          /* ignore */
        }
      };
      socket.onopen = () => {
        heartbeat = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'heartbeat' }));
          }
        }, 25000);
      };
      socket.onclose = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (!closed) setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      socket?.close();
    };
  }, [enabled]);
}
