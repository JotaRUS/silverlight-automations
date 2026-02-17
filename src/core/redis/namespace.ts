import { env } from '../../config/env';

export function namespacedRedisKey(key: string): string {
  return `${env.REDIS_NAMESPACE}:${key}`;
}
