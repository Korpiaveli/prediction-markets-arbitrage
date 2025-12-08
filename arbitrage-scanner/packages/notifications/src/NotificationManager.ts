/**
 * Notification Manager
 *
 * Orchestrates sending notifications across multiple channels with:
 * - Batching and rate limiting
 * - Priority-based routing
 * - Quiet hours support
 * - Statistics tracking
 */

import {
  NotificationPayload,
  NotificationResult,
  NotificationProvider,
  NotificationManagerConfig,
  NotificationBatch,
  NotificationStats,
  ChannelType,
  NotificationPriority,
  ChannelConfig
} from './types';
import { EmailProvider } from './providers/EmailProvider';
import { DiscordProvider } from './providers/DiscordProvider';

export class NotificationManager {
  private providers: Map<ChannelType, NotificationProvider> = new Map();
  private config: NotificationManagerConfig;
  private batch: NotificationPayload[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private stats: NotificationStats;
  private rateLimitCounters: {
    minute: { count: number; resetAt: Date };
    hour: { count: number; resetAt: Date };
  };

  constructor(config: NotificationManagerConfig) {
    this.config = config;
    this.stats = this.initStats();
    this.rateLimitCounters = {
      minute: { count: 0, resetAt: this.getNextMinute() },
      hour: { count: 0, resetAt: this.getNextHour() }
    };
    this.initializeProviders(config.channels);
  }

  private initStats(): NotificationStats {
    return {
      totalSent: 0,
      totalFailed: 0,
      byChannel: {
        email: { sent: 0, failed: 0 },
        discord: { sent: 0, failed: 0 },
        slack: { sent: 0, failed: 0 },
        webhook: { sent: 0, failed: 0 }
      },
      byPriority: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      }
    };
  }

  private initializeProviders(channels: ChannelConfig[]): void {
    for (const channelConfig of channels) {
      if (!channelConfig.enabled) continue;

      let provider: NotificationProvider | null = null;

      switch (channelConfig.channel) {
        case 'email':
          provider = new EmailProvider(channelConfig);
          break;
        case 'discord':
          provider = new DiscordProvider(channelConfig);
          break;
      }

      if (provider) {
        this.providers.set(channelConfig.channel, provider);
      }
    }
  }

  /**
   * Send a notification immediately or add to batch
   */
  async notify(payload: NotificationPayload): Promise<NotificationResult[]> {
    if (this.isInQuietHours() && payload.priority !== 'critical') {
      return [{ success: false, channel: 'email', error: 'Quiet hours active', timestamp: new Date() }];
    }

    if (this.config.batching?.enabled && payload.priority !== 'critical') {
      return this.addToBatch(payload);
    }

    return this.sendImmediate(payload);
  }

  /**
   * Send notification immediately to all configured channels
   */
  async sendImmediate(payload: NotificationPayload): Promise<NotificationResult[]> {
    if (!this.checkRateLimit()) {
      return [{ success: false, channel: 'email', error: 'Rate limit exceeded', timestamp: new Date() }];
    }

    const channels = this.getChannelsForPriority(payload.priority);
    const results: NotificationResult[] = [];

    for (const channel of channels) {
      const provider = this.providers.get(channel);
      if (!provider || !provider.isEnabled()) continue;

      try {
        const result = await provider.send(payload);
        results.push(result);
        this.updateStats(result, payload.priority);
      } catch (error) {
        const errorResult: NotificationResult = {
          success: false,
          channel,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        };
        results.push(errorResult);
        this.updateStats(errorResult, payload.priority);
      }
    }

    this.incrementRateLimitCounters();
    return results;
  }

  /**
   * Add notification to batch queue
   */
  private addToBatch(payload: NotificationPayload): NotificationResult[] {
    this.batch.push(payload);

    if (!this.batchTimer && this.config.batching) {
      this.batchTimer = setTimeout(
        () => this.flushBatch(),
        this.config.batching.intervalMs
      );
    }

    if (this.config.batching && this.batch.length >= this.config.batching.maxPerBatch) {
      this.flushBatch();
    }

    return [{ success: true, channel: 'email', messageId: 'batched', timestamp: new Date() }];
  }

  /**
   * Flush all batched notifications
   */
  async flushBatch(): Promise<NotificationBatch | null> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batch.length === 0) return null;

    const batchPayloads = [...this.batch];
    this.batch = [];

    const batchId = `batch-${Date.now()}`;
    const combinedPayload = this.combineBatchPayloads(batchPayloads, batchId);
    const results = await this.sendImmediate(combinedPayload);

    return {
      id: batchId,
      notifications: batchPayloads,
      createdAt: batchPayloads[0].timestamp,
      sentAt: new Date(),
      results
    };
  }

  /**
   * Combine multiple notifications into a single payload
   */
  private combineBatchPayloads(payloads: NotificationPayload[], batchId: string): NotificationPayload {
    const highestPriority = payloads.reduce((highest, p) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[p.priority] < order[highest] ? p.priority : highest;
    }, 'low' as NotificationPriority);

    const bodies = payloads.map((p, i) =>
      `${i + 1}. [${p.priority.toUpperCase()}] ${p.title}\n   ${p.body}`
    );

    return {
      id: batchId,
      type: 'summary',
      priority: highestPriority,
      title: `Batch Summary: ${payloads.length} Notifications`,
      body: bodies.join('\n\n'),
      timestamp: new Date(),
      data: {
        batchSize: payloads.length,
        notifications: payloads.map(p => ({ id: p.id, type: p.type, priority: p.priority }))
      }
    };
  }

  /**
   * Get channels for a given priority based on routing config
   */
  private getChannelsForPriority(priority: NotificationPriority): ChannelType[] {
    if (this.config.routing) {
      return this.config.routing[priority] || Array.from(this.providers.keys());
    }
    return Array.from(this.providers.keys());
  }

  /**
   * Check if within quiet hours
   */
  private isInQuietHours(): boolean {
    if (!this.config.quietHours?.enabled) return false;

    const now = new Date();
    const hour = now.getHours();
    const { startHour, endHour } = this.config.quietHours;

    if (startHour < endHour) {
      return hour >= startHour && hour < endHour;
    } else {
      return hour >= startHour || hour < endHour;
    }
  }

  /**
   * Check rate limits
   */
  private checkRateLimit(): boolean {
    if (!this.config.rateLimit) return true;

    this.resetExpiredCounters();

    if (this.rateLimitCounters.minute.count >= this.config.rateLimit.maxPerMinute) {
      return false;
    }
    if (this.rateLimitCounters.hour.count >= this.config.rateLimit.maxPerHour) {
      return false;
    }

    return true;
  }

  private incrementRateLimitCounters(): void {
    this.rateLimitCounters.minute.count++;
    this.rateLimitCounters.hour.count++;
  }

  private resetExpiredCounters(): void {
    const now = new Date();

    if (now >= this.rateLimitCounters.minute.resetAt) {
      this.rateLimitCounters.minute = { count: 0, resetAt: this.getNextMinute() };
    }
    if (now >= this.rateLimitCounters.hour.resetAt) {
      this.rateLimitCounters.hour = { count: 0, resetAt: this.getNextHour() };
    }
  }

  private getNextMinute(): Date {
    const next = new Date();
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);
    return next;
  }

  private getNextHour(): Date {
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next;
  }

  private updateStats(result: NotificationResult, priority: NotificationPriority): void {
    if (result.success) {
      this.stats.totalSent++;
      this.stats.byChannel[result.channel].sent++;
    } else {
      this.stats.totalFailed++;
      this.stats.byChannel[result.channel].failed++;
    }
    this.stats.byPriority[priority]++;
    this.stats.lastSentAt = new Date();
  }

  /**
   * Get current statistics
   */
  getStats(): NotificationStats {
    return { ...this.stats };
  }

  /**
   * Get list of enabled channels
   */
  getEnabledChannels(): ChannelType[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isEnabled())
      .map(([channel, _]) => channel);
  }

  /**
   * Create a notification payload with defaults
   */
  static createPayload(
    title: string,
    body: string,
    options: Partial<Omit<NotificationPayload, 'id' | 'timestamp'>> = {}
  ): NotificationPayload {
    return {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      body,
      type: options.type || 'info',
      priority: options.priority || 'medium',
      timestamp: new Date(),
      data: options.data,
      tags: options.tags
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }
}
