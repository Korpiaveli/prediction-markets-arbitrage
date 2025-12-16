import PQueue from 'p-queue';
import { ExchangeName } from '@arb/core';
import { RateLimitConfig, RateLimitStats, DEFAULT_RATE_LIMITS } from '../types.js';

export class RateLimitedQueue {
  private queue: PQueue;
  private config: RateLimitConfig;
  private stats: RateLimitStats;
  private adaptiveDelay: number = 0;

  constructor(exchange: ExchangeName, customConfig?: Partial<RateLimitConfig>) {
    this.config = {
      ...DEFAULT_RATE_LIMITS[exchange],
      ...customConfig
    };

    this.stats = {
      pending: 0,
      active: 0,
      completed: 0,
      failed: 0,
      rateLimitHits: 0
    };

    this.queue = new PQueue({
      concurrency: this.config.maxConcurrent,
      interval: 60000, // 1 minute window
      intervalCap: this.config.maxRequestsPerMinute
    });

    this.queue.on('active', () => {
      this.stats.active = this.queue.pending + 1;
      this.stats.pending = this.queue.size;
    });

    this.queue.on('idle', () => {
      this.stats.active = 0;
      this.stats.pending = 0;
    });
  }

  async add<T>(fn: () => Promise<T>, priority: number = 0): Promise<T> {
    return this.queue.add(async () => {
      // Apply adaptive delay if we recently hit rate limits
      if (this.adaptiveDelay > 0) {
        await this.delay(this.adaptiveDelay);
      }

      let lastError: Error | null = null;
      let attempt = 0;

      while (attempt <= this.config.maxRetries) {
        try {
          const result = await fn();
          this.stats.completed++;
          // Reduce adaptive delay on success
          this.adaptiveDelay = Math.max(0, this.adaptiveDelay - 100);
          return result;
        } catch (error: any) {
          lastError = error;
          attempt++;

          if (this.isRateLimitError(error)) {
            this.stats.rateLimitHits++;

            if (!this.config.retryOnRateLimit) {
              throw error;
            }

            const retryAfter = this.getRetryAfter(error);
            const backoffMs = retryAfter * 1000 * Math.pow(this.config.backoffMultiplier, attempt - 1);

            // Increase adaptive delay for future requests
            this.adaptiveDelay = Math.min(5000, this.adaptiveDelay + 500);

            console.log(`[RateLimitedQueue] Rate limited, attempt ${attempt}/${this.config.maxRetries}, waiting ${backoffMs}ms`);
            await this.delay(backoffMs);
          } else if (this.isRetryableError(error)) {
            const backoffMs = 1000 * Math.pow(this.config.backoffMultiplier, attempt - 1);
            console.log(`[RateLimitedQueue] Retryable error, attempt ${attempt}/${this.config.maxRetries}, waiting ${backoffMs}ms`);
            await this.delay(backoffMs);
          } else {
            this.stats.failed++;
            throw error;
          }
        }
      }

      this.stats.failed++;
      throw lastError || new Error('Max retries exceeded');
    }, { priority }) as Promise<T>;
  }

  async addBatch<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    options: {
      onProgress?: (completed: number, total: number) => void;
      onError?: (item: T, error: Error) => void;
      continueOnError?: boolean;
    } = {}
  ): Promise<Map<T, R | Error>> {
    const results = new Map<T, R | Error>();
    const { onProgress, onError, continueOnError = true } = options;
    let completed = 0;

    const tasks = items.map(item =>
      this.add(async () => {
        try {
          const result = await fn(item);
          results.set(item, result);
          return result;
        } catch (error: any) {
          if (onError) {
            onError(item, error);
          }
          results.set(item, error);
          if (!continueOnError) {
            throw error;
          }
          return null;
        } finally {
          completed++;
          if (onProgress) {
            onProgress(completed, items.length);
          }
        }
      })
    );

    await Promise.all(tasks.map(t => t.catch(() => {})));
    return results;
  }

  handleRateLimitResponse(retryAfterSeconds: number): void {
    this.stats.rateLimitHits++;
    this.adaptiveDelay = Math.min(10000, Math.max(this.adaptiveDelay, retryAfterSeconds * 500));
  }

  getStats(): RateLimitStats {
    return {
      ...this.stats,
      pending: this.queue.size,
      active: this.queue.pending
    };
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  getPending(): number {
    return this.queue.pending;
  }

  async waitForIdle(): Promise<void> {
    await this.queue.onIdle();
  }

  clear(): void {
    this.queue.clear();
    this.stats.pending = 0;
  }

  pause(): void {
    this.queue.pause();
  }

  resume(): void {
    this.queue.start();
  }

  private isRateLimitError(error: any): boolean {
    return error?.response?.status === 429 ||
           error?.message?.toLowerCase().includes('rate limit') ||
           error?.code === 'RATE_LIMITED';
  }

  private isRetryableError(error: any): boolean {
    const status = error?.response?.status;
    return status === 500 ||
           status === 502 ||
           status === 503 ||
           status === 504 ||
           error?.code === 'ECONNRESET' ||
           error?.code === 'ETIMEDOUT' ||
           error?.code === 'ENOTFOUND';
  }

  private getRetryAfter(error: any): number {
    const retryAfter = error?.response?.headers?.['retry-after'];
    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return 5; // Default 5 seconds
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export function createQueueForExchange(exchange: ExchangeName, customConfig?: Partial<RateLimitConfig>): RateLimitedQueue {
  return new RateLimitedQueue(exchange, customConfig);
}
