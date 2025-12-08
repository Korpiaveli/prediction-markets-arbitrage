/**
 * Base Provider
 *
 * Abstract base class for all notification providers.
 */

import {
  NotificationProvider,
  NotificationPayload,
  NotificationResult,
  ChannelType,
  BaseProviderConfig
} from '../types';

export abstract class BaseProvider implements NotificationProvider {
  abstract readonly channel: ChannelType;
  protected config: BaseProviderConfig;

  constructor(config: BaseProviderConfig) {
    this.config = config;
  }

  get name(): string {
    return this.config.name || this.channel;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  abstract send(payload: NotificationPayload): Promise<NotificationResult>;

  protected createSuccessResult(messageId?: string): NotificationResult {
    return {
      success: true,
      channel: this.channel,
      messageId,
      timestamp: new Date()
    };
  }

  protected createErrorResult(error: string): NotificationResult {
    return {
      success: false,
      channel: this.channel,
      error,
      timestamp: new Date()
    };
  }

  protected formatBody(payload: NotificationPayload): string {
    let body = payload.body;

    if (payload.data && Object.keys(payload.data).length > 0) {
      body += '\n\n---\nDetails:\n';
      for (const [key, value] of Object.entries(payload.data)) {
        body += `• ${key}: ${JSON.stringify(value)}\n`;
      }
    }

    return body;
  }

  protected getPriorityEmoji(payload: NotificationPayload): string {
    switch (payload.priority) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '📢';
      case 'low': return '📝';
      default: return '📌';
    }
  }

  protected getTypeEmoji(payload: NotificationPayload): string {
    switch (payload.type) {
      case 'recommendation': return '💡';
      case 'alert': return '🔔';
      case 'summary': return '📊';
      case 'error': return '❌';
      case 'info': return 'ℹ️';
      default: return '📌';
    }
  }
}
