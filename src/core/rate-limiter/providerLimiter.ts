import pLimit from 'p-limit';

type Limit = ReturnType<typeof pLimit>;

export class ProviderLimiter {
  private readonly limiters = new Map<string, Limit>();

  public constructor(private readonly defaultConcurrency: number) {}

  public run<T>(providerName: string, work: () => Promise<T>, concurrency?: number): Promise<T> {
    const limiter = this.getOrCreateLimiter(providerName, concurrency);
    return limiter(work);
  }

  private getOrCreateLimiter(providerName: string, concurrency?: number): Limit {
    const existingLimiter = this.limiters.get(providerName);
    if (existingLimiter) {
      return existingLimiter;
    }

    const limiter = pLimit(concurrency ?? this.defaultConcurrency);
    this.limiters.set(providerName, limiter);
    return limiter;
  }
}

export const providerLimiter = new ProviderLimiter(4);
