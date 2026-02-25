'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

export function useSocket<TPayload>(
  namespace: '/admin' | '/caller',
  eventName: string,
  onMessage: (payload: TPayload) => void
): void {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(namespace, {
      path: '/socket.io',
      withCredentials: true
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
