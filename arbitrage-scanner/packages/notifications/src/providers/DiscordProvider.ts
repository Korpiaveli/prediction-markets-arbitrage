/**
 * Discord Provider
 *
 * Sends notifications via Discord webhooks with rich embeds.
 */

import {
  NotificationPayload,
  NotificationResult,
  ChannelType,
  DiscordProviderConfig
} from '../types';
import { BaseProvider } from './BaseProvider';

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
}

export class DiscordProvider extends BaseProvider {
  readonly channel: ChannelType = 'discord';
  protected discordConfig: DiscordProviderConfig;

  constructor(config: DiscordProviderConfig) {
    super(config);
    this.discordConfig = config;
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    if (!this.isEnabled()) {
      return this.createErrorResult('Discord provider is disabled');
    }

    if (!this.discordConfig.webhookUrl) {
      return this.createErrorResult('Discord webhook URL not configured');
    }

    try {
      const discordPayload = this.formatDiscordPayload(payload);

      const response = await fetch(this.discordConfig.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(discordPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return this.createErrorResult(`Discord API error: ${response.status} - ${errorText}`);
      }

      return this.createSuccessResult(`discord-${Date.now()}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(`Failed to send Discord notification: ${errorMessage}`);
    }
  }

  private formatDiscordPayload(payload: NotificationPayload): DiscordWebhookPayload {
    const color = this.getPriorityColor(payload);
    const fields = this.buildFields(payload);

    const mentions = this.discordConfig.mentionRoles && payload.priority === 'critical'
      ? this.discordConfig.mentionRoles.map(r => `<@&${r}>`).join(' ')
      : undefined;

    return {
      content: mentions,
      username: this.discordConfig.username || 'Arbitrage Scanner',
      avatar_url: this.discordConfig.avatarUrl,
      embeds: [{
        title: `${this.getPriorityEmoji(payload)} ${payload.title}`,
        description: payload.body,
        color,
        fields,
        footer: {
          text: `${payload.type} | ID: ${payload.id}`
        },
        timestamp: payload.timestamp.toISOString()
      }]
    };
  }

  private getPriorityColor(payload: NotificationPayload): number {
    switch (payload.priority) {
      case 'critical': return 0xDC3545; // Red
      case 'high': return 0xFD7E14;     // Orange
      case 'medium': return 0xFFC107;   // Yellow
      case 'low': return 0x28A745;      // Green
      default: return 0x6C757D;         // Gray
    }
  }

  private buildFields(payload: NotificationPayload): DiscordEmbed['fields'] {
    const fields: { name: string; value: string; inline?: boolean }[] = [
      { name: 'Priority', value: payload.priority.toUpperCase(), inline: true },
      { name: 'Type', value: payload.type, inline: true }
    ];

    if (payload.tags && payload.tags.length > 0) {
      fields.push({ name: 'Tags', value: payload.tags.join(', '), inline: true });
    }

    if (payload.data) {
      const dataEntries = Object.entries(payload.data);
      const maxFields = 6;
      const displayEntries = dataEntries.slice(0, maxFields);

      for (const [key, value] of displayEntries) {
        const displayValue = typeof value === 'object'
          ? JSON.stringify(value).substring(0, 100)
          : String(value).substring(0, 100);

        fields.push({
          name: this.formatFieldName(key),
          value: displayValue || '-',
          inline: displayValue.length < 30
        });
      }

      if (dataEntries.length > maxFields) {
        fields.push({
          name: 'More',
          value: `+${dataEntries.length - maxFields} additional fields`,
          inline: false
        });
      }
    }

    return fields;
  }

  private formatFieldName(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/^\w/, c => c.toUpperCase())
      .trim();
  }
}
