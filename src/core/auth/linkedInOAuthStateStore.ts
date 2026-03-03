import { redisConnection } from '../../queues/redis';
import { namespacedRedisKey } from '../redis/namespace';

const KEY_PREFIX = 'linkedin-oauth-state';

export interface LinkedInOAuthStateSession {
  providerAccountId: string;
  issuedToUserId: string;
  scopes: string[];
}

function stateRedisKey(state: string): string {
  return namespacedRedisKey(`${KEY_PREFIX}:${state}`);
}

export class LinkedInOAuthStateStore {
  constructor(private readonly ttlSeconds: number) {}

  async set(state: string, session: LinkedInOAuthStateSession): Promise<void> {
    await redisConnection.set(
      stateRedisKey(state),
      JSON.stringify(session),
      'EX',
      this.ttlSeconds
    );
  }

  async consume(state: string): Promise<LinkedInOAuthStateSession | null> {
    const key = stateRedisKey(state);
    const raw = await redisConnection.get(key);
    if (!raw) {
      return null;
    }
    await redisConnection.del(key);
    return JSON.parse(raw) as LinkedInOAuthStateSession;
  }
}
