'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

const BACKEND_ORIGIN = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3000';

export function useSocket<TPayload>(
  namespace: '/admin' | '/caller',
  eventName: string,
  onMessage: (payload: TPayload) => void
): void {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(`${BACKEND_ORIGIN}${namespace}`, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;
    socket.on(eventName, onMessage as (...args: unknown[]) => void);
    return () => {
      socket.off(eventName, onMessage as (...args: unknown[]) => void);
      socket.close();
      socketRef.current = null;
    };
  }, [eventName, namespace, onMessage]);
}
