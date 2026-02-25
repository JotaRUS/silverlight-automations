import type { Server as HttpServer } from 'node:http';

import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';

import { env } from '../../config/env';
import { verifyAccessToken } from '../auth/jwt';
import { logger } from '../logging/logger';
import { subscribeRealtimeEvents } from './realtimePubSub';
import type { RealtimeEventEnvelope, RealtimeNamespace } from './types';

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, chunk) => {
      const separatorIndex = chunk.indexOf('=');
      if (separatorIndex <= 0) {
        return accumulator;
      }
      const key = chunk.slice(0, separatorIndex).trim();
      const value = chunk.slice(separatorIndex + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function namespaceRole(namespace: RealtimeNamespace): 'admin' | 'ops' | 'caller' {
  return namespace === 'caller' ? 'caller' : 'admin';
}

function authorizeSocket(socket: Socket, namespace: RealtimeNamespace): boolean {
  const cookieHeader = socket.handshake.headers.cookie;
  const token = parseCookieHeader(cookieHeader).access_token;
  if (!token) {
    return false;
  }

  try {
    const payload = verifyAccessToken(token);
    if (namespace === 'admin') {
      return payload.role === 'admin' || payload.role === 'ops';
    }
    return payload.role === namespaceRole(namespace);
  } catch {
    return false;
  }
}

export interface RealtimeSocketRuntime {
  io: Server;
  shutdown: () => Promise<void>;
}

export async function attachRealtimeSocketServer(httpServer: HttpServer): Promise<RealtimeSocketRuntime> {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: true,
      credentials: true
    }
  });

  const pubClient = createClient({ url: env.REDIS_URL });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  const adminNamespace = io.of('/admin');
  const callerNamespace = io.of('/caller');

  adminNamespace.use((socket, next) => {
    if (!authorizeSocket(socket, 'admin')) {
      next(new Error('unauthorized'));
      return;
    }
    next();
  });
  callerNamespace.use((socket, next) => {
    if (!authorizeSocket(socket, 'caller')) {
      next(new Error('unauthorized'));
      return;
    }
    next();
  });

  adminNamespace.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'admin-socket-connected');
  });
  callerNamespace.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'caller-socket-connected');
  });

  await subscribeRealtimeEvents((event: RealtimeEventEnvelope) => {
    const targetNamespace = event.namespace === 'caller' ? callerNamespace : adminNamespace;
    targetNamespace.emit(event.event, event.data);
  });

  return {
    io,
    shutdown: async (): Promise<void> => {
      await Promise.all([pubClient.quit(), subClient.quit()]);
      await io.close();
    }
  };
}

