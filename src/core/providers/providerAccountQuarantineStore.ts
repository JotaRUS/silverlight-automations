import { namespacedRedisKey } from '../redis/namespace';
import { redisConnection } from '../../queues/redis';

const QUARANTINE_KEY_PREFIX = 'provider-account:quarantine';

function quarantineRedisKey(providerAccountId: string): string {
  return namespacedRedisKey(`${QUARANTINE_KEY_PREFIX}:${providerAccountId}`);
}

export class ProviderAccountQuarantineStore {
  public async quarantine(providerAccountId: string, durationSeconds: number): Promise<void> {
    await redisConnection.set(quarantineRedisKey(providerAccountId), '1', 'EX', durationSeconds);
  }

  public async isQuarantined(providerAccountId: string): Promise<boolean> {
    const value = await redisConnection.get(quarantineRedisKey(providerAccountId));
    return value === '1';
  }
}

