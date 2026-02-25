import Redis from 'ioredis';

import { env } from '../../config/env';
import { namespacedRedisKey } from '../redis/namespace';
import type { RealtimeEventEnvelope } from './types';

const realtimeEventChannel = namespacedRedisKey('realtime:events');
const publisherClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true
});
const subscriberClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true
});

export async function publishRealtimeEvent(event: RealtimeEventEnvelope): Promise<void> {
  await publisherClient.publish(realtimeEventChannel, JSON.stringify(event));
}

export async function subscribeRealtimeEvents(
  handler: (event: RealtimeEventEnvelope) => void
): Promise<void> {
  await subscriberClient.subscribe(realtimeEventChannel);
  subscriberClient.on('message', (_channel, payload) => {
    try {
      const parsed = JSON.parse(payload) as RealtimeEventEnvelope;
      handler(parsed);
    } catch {
      // Ignore malformed events.
    }
  });
}

export async function shutdownRealtimePubSub(): Promise<void> {
  await publisherClient.quit();
  await subscriberClient.quit();
}

