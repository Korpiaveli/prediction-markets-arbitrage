/**
 * Alert Service
 *
 * Sends notifications for arbitrage opportunities via Discord, Telegram, etc.
 */

import axios from 'axios';
import { AlertConfig } from '../types';

export interface ArbitrageAlert {
  opportunityId: string;
  kalshiMarket: string;
  polymarketMarket: string;
  profitPercent: number;
  investmentRequired: number;
  direction: string;
  timestamp: Date;
  confidence?: number;
  resolutionRisk?: string;
}

export class AlertService {
  private readonly config: AlertConfig;
  private alertsSent = 0;
  private lastAlertTime?: Date;

  constructor(config: AlertConfig = {}) {
    this.config = config;
  }

  /**
   * Send alert for arbitrage opportunity
   */
  async sendOpportunityAlert(alert: ArbitrageAlert): Promise<void> {
    const promises: Promise<void>[] = [];

    // Discord alert
    if (this.config.discord?.enabled && this.shouldSendDiscordAlert(alert)) {
      promises.push(this.sendDiscordAlert(alert));
    }

    // Telegram alert
    if (this.config.telegram?.enabled && this.shouldSendTelegramAlert(alert)) {
      promises.push(this.sendTelegramAlert(alert));
    }

    await Promise.allSettled(promises);
    this.alertsSent++;
    this.lastAlertTime = new Date();
  }

  /**
   * Check if Discord alert should be sent
   */
  private shouldSendDiscordAlert(alert: ArbitrageAlert): boolean {
    const minProfit = this.config.discord?.minProfitPercent ?? 5;
    return alert.profitPercent >= minProfit;
  }

  /**
   * Check if Telegram alert should be sent
   */
  private shouldSendTelegramAlert(alert: ArbitrageAlert): boolean {
    const minProfit = this.config.telegram?.minProfitPercent ?? 5;
    return alert.profitPercent >= minProfit;
  }

  /**
   * Send Discord webhook alert
   */
  private async sendDiscordAlert(alert: ArbitrageAlert): Promise<void> {
    if (!this.config.discord?.webhookUrl) {
      throw new Error('Discord webhook URL not configured');
    }

    const embed = {
      title: '🎯 Arbitrage Opportunity Detected',
      color: this.getAlertColor(alert.profitPercent),
      fields: [
        {
          name: '💰 Profit Potential',
          value: `${alert.profitPercent.toFixed(2)}%`,
          inline: true
        },
        {
          name: '💵 Investment',
          value: `$${alert.investmentRequired.toFixed(2)}`,
          inline: true
        },
        {
          name: '📊 Direction',
          value: alert.direction,
          inline: true
        },
        {
          name: '📈 Kalshi Market',
          value: alert.kalshiMarket.substring(0, 100),
          inline: false
        },
        {
          name: '📉 Polymarket Market',
          value: alert.polymarketMarket.substring(0, 100),
          inline: false
        }
      ],
      footer: {
        text: `ID: ${alert.opportunityId} | ${alert.timestamp.toISOString()}`
      }
    };

    if (alert.confidence) {
      embed.fields.push({
        name: '🎲 Confidence',
        value: `${alert.confidence.toFixed(0)}%`,
        inline: true
      });
    }

    if (alert.resolutionRisk) {
      embed.fields.push({
        name: '⚠️ Resolution Risk',
        value: alert.resolutionRisk,
        inline: true
      });
    }

    try {
      await axios.post(this.config.discord.webhookUrl, {
        embeds: [embed]
      });
    } catch (error) {
      console.error('Failed to send Discord alert:', error);
      throw error;
    }
  }

  /**
   * Send Telegram alert
   */
  private async sendTelegramAlert(alert: ArbitrageAlert): Promise<void> {
    if (!this.config.telegram?.botToken || !this.config.telegram?.chatId) {
      throw new Error('Telegram not configured');
    }

    const message = this.formatTelegramMessage(alert);
    const url = `https://api.telegram.org/bot${this.config.telegram.botToken}/sendMessage`;

    try {
      await axios.post(url, {
        chat_id: this.config.telegram.chatId,
        text: message,
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Failed to send Telegram alert:', error);
      throw error;
    }
  }

  /**
   * Format Telegram message
   */
  private formatTelegramMessage(alert: ArbitrageAlert): string {
    let message = `🎯 *Arbitrage Opportunity*\n\n`;
    message += `💰 *Profit:* ${alert.profitPercent.toFixed(2)}%\n`;
    message += `💵 *Investment:* $${alert.investmentRequired.toFixed(2)}\n`;
    message += `📊 *Direction:* ${alert.direction}\n\n`;
    message += `📈 *Kalshi:* ${alert.kalshiMarket.substring(0, 100)}\n`;
    message += `📉 *Polymarket:* ${alert.polymarketMarket.substring(0, 100)}\n\n`;

    if (alert.confidence) {
      message += `🎲 *Confidence:* ${alert.confidence.toFixed(0)}%\n`;
    }

    if (alert.resolutionRisk) {
      message += `⚠️ *Risk:* ${alert.resolutionRisk}\n`;
    }

    message += `\n_ID: ${alert.opportunityId}_`;

    return message;
  }

  /**
   * Get alert color based on profit
   */
  private getAlertColor(profitPercent: number): number {
    if (profitPercent >= 10) return 0x00ff00; // Green
    if (profitPercent >= 7) return 0xffff00;  // Yellow
    if (profitPercent >= 5) return 0xff9900;  // Orange
    return 0xff0000; // Red
  }

  /**
   * Send test alert
   */
  async sendTestAlert(): Promise<void> {
    const testAlert: ArbitrageAlert = {
      opportunityId: 'TEST-' + Date.now(),
      kalshiMarket: 'Test Kalshi Market - 2024 Election',
      polymarketMarket: 'Test Polymarket Market - 2024 Election',
      profitPercent: 8.5,
      investmentRequired: 1000,
      direction: 'KALSHI_YES_POLY_NO',
      timestamp: new Date(),
      confidence: 85,
      resolutionRisk: 'Low'
    };

    await this.sendOpportunityAlert(testAlert);
  }

  /**
   * Get alert statistics
   */
  getStats() {
    return {
      alertsSent: this.alertsSent,
      lastAlertTime: this.lastAlertTime
    };
  }
}
