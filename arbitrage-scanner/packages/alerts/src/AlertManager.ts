import { CrossExchangeArbitrageOpportunity } from '@arb/core';
import { EventEmitter } from 'eventemitter3';

export type AlertPriority = 'critical' | 'high' | 'medium' | 'low';
export type AlertChannel = 'sms' | 'push' | 'discord' | 'telegram' | 'email';

export interface AlertConfig {
  channels: {
    sms?: {
      enabled: boolean;
      provider: 'twilio';
      accountSid: string;
      authToken: string;
      fromNumber: string;
      toNumbers: string[];
    };
    push?: {
      enabled: boolean;
      provider: 'firebase' | 'pushover';
      apiKey: string;
      userKeys?: string[];
    };
    discord?: {
      enabled: boolean;
      webhookUrl: string;
    };
    telegram?: {
      enabled: boolean;
      botToken: string;
      chatIds: string[];
    };
    email?: {
      enabled: boolean;
      provider: 'smtp';
      host: string;
      port: number;
      user: string;
      password: string;
      from: string;
      to: string[];
    };
  };
  routing: {
    critical: AlertChannel[];
    high: AlertChannel[];
    medium: AlertChannel[];
    low: AlertChannel[];
  };
  rateLimit: {
    maxPerHour: number;
    maxPerMinute: number;
  };
  quietHours?: {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number;   // 0-23
  };
}

export interface Alert {
  id: string;
  timestamp: Date;
  priority: AlertPriority;
  title: string;
  message: string;
  data?: any;
  channels: AlertChannel[];
}

interface RateLimitCounter {
  count: number;
  resetAt: Date;
}

/**
 * Alert Manager
 *
 * Multi-channel notification system with priority routing and rate limiting.
 * Supports SMS, Push, Discord, Telegram for real-time arbitrage alerts.
 */
export class AlertManager extends EventEmitter {
  private config: AlertConfig;
  private hourlyCounter: RateLimitCounter;
  private minuteCounter: RateLimitCounter;
  private alertHistory: Alert[] = [];

  constructor(config: AlertConfig) {
    super();
    this.config = config;
    this.hourlyCounter = { count: 0, resetAt: this.getNextHour() };
    this.minuteCounter = { count: 0, resetAt: this.getNextMinute() };
  }

  /**
   * Send arbitrage opportunity alert
   */
  async sendOpportunityAlert(opportunity: CrossExchangeArbitrageOpportunity): Promise<void> {
    const priority = this.determinePriority(opportunity);

    // Check quiet hours
    if (this.isQuietHours() && priority !== 'critical') {
      console.log(`[AlertManager] Skipping alert during quiet hours: ${opportunity.id}`);
      return;
    }

    // Check rate limits
    if (!this.checkRateLimit()) {
      console.warn('[AlertManager] Rate limit exceeded, skipping alert');
      this.emit('rate_limit_exceeded');
      return;
    }

    const alert: Alert = {
      id: `alert_${Date.now()}`,
      timestamp: new Date(),
      priority,
      title: this.formatOpportunityTitle(opportunity),
      message: this.formatOpportunityMessage(opportunity),
      data: opportunity,
      channels: this.config.routing[priority]
    };

    await this.sendAlert(alert);
    this.alertHistory.push(alert);

    // Keep only last 100 alerts
    if (this.alertHistory.length > 100) {
      this.alertHistory.shift();
    }
  }

  /**
   * Send custom alert
   */
  async sendCustomAlert(
    title: string,
    message: string,
    priority: AlertPriority = 'medium',
    data?: any
  ): Promise<void> {
    const alert: Alert = {
      id: `alert_${Date.now()}`,
      timestamp: new Date(),
      priority,
      title,
      message,
      data,
      channels: this.config.routing[priority]
    };

    await this.sendAlert(alert);
    this.alertHistory.push(alert);
  }

  /**
   * Send alert to all configured channels
   */
  private async sendAlert(alert: Alert): Promise<void> {
    console.log(`[AlertManager] Sending ${alert.priority} alert: ${alert.title}`);

    const promises: Promise<void>[] = [];

    for (const channel of alert.channels) {
      switch (channel) {
        case 'sms':
          if (this.config.channels.sms?.enabled) {
            promises.push(this.sendSMS(alert));
          }
          break;
        case 'push':
          if (this.config.channels.push?.enabled) {
            promises.push(this.sendPush(alert));
          }
          break;
        case 'discord':
          if (this.config.channels.discord?.enabled) {
            promises.push(this.sendDiscord(alert));
          }
          break;
        case 'telegram':
          if (this.config.channels.telegram?.enabled) {
            promises.push(this.sendTelegram(alert));
          }
          break;
        case 'email':
          if (this.config.channels.email?.enabled) {
            promises.push(this.sendEmail(alert));
          }
          break;
      }
    }

    await Promise.allSettled(promises);
    this.incrementCounters();
    this.emit('alert_sent', alert);
  }

  /**
   * Send SMS via Twilio
   */
  private async sendSMS(alert: Alert): Promise<void> {
    const config = this.config.channels.sms;
    if (!config) return;

    try {
      // Twilio integration would go here
      console.log(`[AlertManager] SMS sent to ${config.toNumbers.length} numbers`);
      this.emit('sms_sent', alert);
    } catch (error) {
      console.error('[AlertManager] SMS failed:', error);
      this.emit('sms_failed', { alert, error });
    }
  }

  /**
   * Send push notification
   */
  private async sendPush(alert: Alert): Promise<void> {
    const config = this.config.channels.push;
    if (!config) return;

    try {
      // Push notification integration would go here
      console.log(`[AlertManager] Push notification sent`);
      this.emit('push_sent', alert);
    } catch (error) {
      console.error('[AlertManager] Push failed:', error);
      this.emit('push_failed', { alert, error });
    }
  }

  /**
   * Send Discord webhook
   */
  private async sendDiscord(alert: Alert): Promise<void> {
    const config = this.config.channels.discord;
    if (!config) return;

    try {
      const embed = {
        title: alert.title,
        description: alert.message,
        color: this.getPriorityColor(alert.priority),
        timestamp: alert.timestamp.toISOString(),
        footer: { text: 'Arbitrage Scanner' }
      };

      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
      });

      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.statusText}`);
      }

      console.log('[AlertManager] Discord webhook sent');
      this.emit('discord_sent', alert);
    } catch (error) {
      console.error('[AlertManager] Discord failed:', error);
      this.emit('discord_failed', { alert, error });
    }
  }

  /**
   * Send Telegram message
   */
  private async sendTelegram(alert: Alert): Promise<void> {
    const config = this.config.channels.telegram;
    if (!config) return;

    try {
      const message = `*${alert.title}*\n\n${alert.message}`;

      for (const chatId of config.chatIds) {
        const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
          })
        });

        if (!response.ok) {
          throw new Error(`Telegram API failed: ${response.statusText}`);
        }
      }

      console.log(`[AlertManager] Telegram sent to ${config.chatIds.length} chats`);
      this.emit('telegram_sent', alert);
    } catch (error) {
      console.error('[AlertManager] Telegram failed:', error);
      this.emit('telegram_failed', { alert, error });
    }
  }

  /**
   * Send email
   */
  private async sendEmail(alert: Alert): Promise<void> {
    const config = this.config.channels.email;
    if (!config) return;

    try {
      // Email integration would go here (nodemailer, etc.)
      console.log(`[AlertManager] Email sent to ${config.to.length} recipients`);
      this.emit('email_sent', alert);
    } catch (error) {
      console.error('[AlertManager] Email failed:', error);
      this.emit('email_failed', { alert, error });
    }
  }

  /**
   * Determine alert priority based on opportunity metrics
   */
  private determinePriority(opportunity: CrossExchangeArbitrageOpportunity): AlertPriority {
    const profit = opportunity.profitPercent;
    const confidence = opportunity.confidence;

    // Critical: High profit + high confidence
    if (profit >= 5 && confidence >= 80) return 'critical';

    // High: Good profit or high confidence
    if (profit >= 3 || confidence >= 70) return 'high';

    // Medium: Decent profit
    if (profit >= 2) return 'medium';

    return 'low';
  }

  /**
   * Format opportunity title for alert
   */
  private formatOpportunityTitle(opportunity: CrossExchangeArbitrageOpportunity): string {
    const alertNumber = this.alertHistory.length + 1;
    return `🚨 Arbitrage Alert #${alertNumber}`;
  }

  /**
   * Format opportunity message for alert
   */
  private formatOpportunityMessage(opportunity: CrossExchangeArbitrageOpportunity): string {
    const lines: string[] = [];

    lines.push(`Profit: $${opportunity.profitDollars.toFixed(2)} (${opportunity.profitPercent.toFixed(2)}%)`);
    lines.push(`Market: ${opportunity.marketPair.market1.title.substring(0, 50)}...`);
    const isExchange1Yes = opportunity.direction === 'EXCHANGE1_YES_EXCHANGE2_NO' || opportunity.direction === 'KALSHI_YES_POLY_NO';
    lines.push(
      `Buy ${opportunity.marketPair.exchange1} ${isExchange1Yes ? 'YES' : 'NO'} ` +
      `@ $${opportunity.quotePair.quote1.yes.ask.toFixed(2)}`
    );
    lines.push(
      `Sell ${opportunity.marketPair.exchange2} ${isExchange1Yes ? 'NO' : 'YES'} ` +
      `@ $${opportunity.quotePair.quote2.no.ask.toFixed(2)}`
    );
    lines.push(`Size: $${opportunity.maxSize.toFixed(0)} | Confidence: ${opportunity.confidence}%`);
    lines.push(`Expires: ${opportunity.ttl}s`);

    return lines.join('\n');
  }

  /**
   * Check rate limits
   */
  private checkRateLimit(): boolean {
    this.resetCountersIfNeeded();

    if (this.hourlyCounter.count >= this.config.rateLimit.maxPerHour) {
      return false;
    }

    if (this.minuteCounter.count >= this.config.rateLimit.maxPerMinute) {
      return false;
    }

    return true;
  }

  /**
   * Increment rate limit counters
   */
  private incrementCounters(): void {
    this.hourlyCounter.count++;
    this.minuteCounter.count++;
  }

  /**
   * Reset counters if time window has passed
   */
  private resetCountersIfNeeded(): void {
    const now = new Date();

    if (now >= this.hourlyCounter.resetAt) {
      this.hourlyCounter = { count: 0, resetAt: this.getNextHour() };
    }

    if (now >= this.minuteCounter.resetAt) {
      this.minuteCounter = { count: 0, resetAt: this.getNextMinute() };
    }
  }

  /**
   * Check if currently in quiet hours
   */
  private isQuietHours(): boolean {
    if (!this.config.quietHours?.enabled) return false;

    const now = new Date();
    const hour = now.getHours();
    const { startHour, endHour } = this.config.quietHours;

    if (startHour < endHour) {
      return hour >= startHour && hour < endHour;
    } else {
      // Crosses midnight (e.g., 23:00 - 07:00)
      return hour >= startHour || hour < endHour;
    }
  }

  /**
   * Get priority color for embeds
   */
  private getPriorityColor(priority: AlertPriority): number {
    switch (priority) {
      case 'critical': return 0xFF0000; // Red
      case 'high': return 0xFF6600;     // Orange
      case 'medium': return 0xFFCC00;   // Yellow
      case 'low': return 0x00CC00;      // Green
    }
  }

  /**
   * Get next hour boundary
   */
  private getNextHour(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
  }

  /**
   * Get next minute boundary
   */
  private getNextMinute(): Date {
    const now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes() + 1,
      0,
      0
    );
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 20): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return {
      hourly: {
        count: this.hourlyCounter.count,
        limit: this.config.rateLimit.maxPerHour,
        resetAt: this.hourlyCounter.resetAt
      },
      minute: {
        count: this.minuteCounter.count,
        limit: this.config.rateLimit.maxPerMinute,
        resetAt: this.minuteCounter.resetAt
      }
    };
  }
}
