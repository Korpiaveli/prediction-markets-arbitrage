/**
 * Notification System Type Definitions
 *
 * Modular, reusable notification types for any application.
 */

export type NotificationType = 'recommendation' | 'alert' | 'summary' | 'error' | 'info';
export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';
export type ChannelType = 'email' | 'discord' | 'slack' | 'webhook';

/**
 * Notification payload sent through channels
 */
export interface NotificationPayload {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  timestamp: Date;
  tags?: string[];
}

/**
 * Result of sending a notification
 */
export interface NotificationResult {
  success: boolean;
  channel: ChannelType;
  messageId?: string;
  error?: string;
  timestamp: Date;
}

/**
 * Base provider configuration
 */
export interface BaseProviderConfig {
  enabled: boolean;
  name?: string;
}

/**
 * Email provider configuration
 */
export interface EmailProviderConfig extends BaseProviderConfig {
  type: 'smtp' | 'sendgrid';
  from: string;
  to: string[];
  smtp?: {
    host: string;
    port: number;
    secure?: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  sendgrid?: {
    apiKey: string;
  };
}

/**
 * Discord provider configuration
 */
export interface DiscordProviderConfig extends BaseProviderConfig {
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
  mentionRoles?: string[];
}

/**
 * Generic webhook provider configuration
 */
export interface WebhookProviderConfig extends BaseProviderConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  authToken?: string;
}

/**
 * Notification manager configuration
 */
export interface NotificationManagerConfig {
  channels: ChannelConfig[];
  batching?: {
    enabled: boolean;
    maxPerBatch: number;
    intervalMs: number;
  };
  rateLimit?: {
    maxPerMinute: number;
    maxPerHour: number;
  };
  routing?: {
    critical: ChannelType[];
    high: ChannelType[];
    medium: ChannelType[];
    low: ChannelType[];
  };
  quietHours?: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    timezone?: string;
  };
}

/**
 * Union of all channel configurations
 */
export type ChannelConfig =
  | ({ channel: 'email' } & EmailProviderConfig)
  | ({ channel: 'discord' } & DiscordProviderConfig)
  | ({ channel: 'webhook' } & WebhookProviderConfig);

/**
 * Template context for rendering notifications
 */
export interface TemplateContext {
  title: string;
  body: string;
  priority: NotificationPriority;
  type: NotificationType;
  timestamp: Date;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Abstract notification provider interface
 */
export interface NotificationProvider {
  readonly channel: ChannelType;
  readonly name: string;
  send(payload: NotificationPayload): Promise<NotificationResult>;
  isEnabled(): boolean;
}

/**
 * Batch of notifications
 */
export interface NotificationBatch {
  id: string;
  notifications: NotificationPayload[];
  createdAt: Date;
  sentAt?: Date;
  results?: NotificationResult[];
}

/**
 * Statistics for the notification manager
 */
export interface NotificationStats {
  totalSent: number;
  totalFailed: number;
  byChannel: Record<ChannelType, { sent: number; failed: number }>;
  byPriority: Record<NotificationPriority, number>;
  lastSentAt?: Date;
}
