/**
 * @arb/notifications - Modular Notification System
 *
 * A standalone, reusable notification package that supports:
 * - Email (SMTP, SendGrid)
 * - Discord (webhooks)
 * - Batching and rate limiting
 * - Priority-based routing
 * - Quiet hours support
 */

export { NotificationManager } from './NotificationManager';
export { BaseProvider, EmailProvider, DiscordProvider } from './providers';

export type {
  NotificationType,
  NotificationPriority,
  ChannelType,
  NotificationPayload,
  NotificationResult,
  BaseProviderConfig,
  EmailProviderConfig,
  DiscordProviderConfig,
  WebhookProviderConfig,
  NotificationManagerConfig,
  ChannelConfig,
  TemplateContext,
  NotificationProvider,
  NotificationBatch,
  NotificationStats
} from './types';
