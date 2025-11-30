/**
 * Kalshi WebSocket Adapter
 *
 * Connects to Kalshi WebSocket API for real-time market data and price updates.
 * API Docs: https://docs.kalshi.com/api/websockets
 */

import { BaseWebSocketManager } from './base';
import { WebSocketConfig, PriceUpdate } from '../types';

interface KalshiWebSocketMessage {
  type: string;
  seq?: number;
  msg?: any;
  sid?: string;
}

interface KalshiPriceMessage {
  market_ticker: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  volume?: number;
  timestamp?: string;
}

export class KalshiWebSocket extends BaseWebSocketManager {
  private messageSeq = 0;

  constructor(config: Partial<WebSocketConfig> = {}) {
    super({
      url: config.url || 'wss://trading-api.kalshi.com/trade-api/ws/v2',
      apiKey: config.apiKey,
      reconnect: config.reconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 5000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      subscribeOnConnect: config.subscribeOnConnect || []
    });
  }

  /**
   * Process incoming message from Kalshi WebSocket
   */
  protected processMessage(message: KalshiWebSocketMessage): void {
    switch (message.type) {
      case 'subscribed':
        this.handleSubscribed(message);
        break;

      case 'unsubscribed':
        this.handleUnsubscribed(message);
        break;

      case 'orderbook_delta':
      case 'orderbook_snapshot':
        this.handlePriceUpdate(message.msg);
        break;

      case 'trade':
        this.handleTradeUpdate(message.msg);
        break;

      case 'error':
        this.handleErrorMessage(message.msg);
        break;

      case 'heartbeat':
        // Acknowledged
        break;

      default:
        // Unknown message type
        break;
    }
  }

  /**
   * Handle subscription confirmation
   */
  private handleSubscribed(_message: KalshiWebSocketMessage): void {
    // Subscription confirmed
  }

  /**
   * Handle unsubscription confirmation
   */
  private handleUnsubscribed(_message: KalshiWebSocketMessage): void {
    // Subscription removed
  }

  /**
   * Handle price update (orderbook delta/snapshot)
   */
  private handlePriceUpdate(data: KalshiPriceMessage): void {
    if (!data?.market_ticker) return;

    const update: PriceUpdate = {
      marketId: data.market_ticker,
      exchange: 'KALSHI',
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      yes: {
        bid: data.yes_bid || 0,
        ask: data.yes_ask || 0,
        mid: ((data.yes_bid || 0) + (data.yes_ask || 0)) / 2
      },
      no: {
        bid: data.no_bid || 0,
        ask: data.no_ask || 0,
        mid: ((data.no_bid || 0) + (data.no_ask || 0)) / 2
      },
      volume24h: data.volume
    };

    this.emit('price_update', update);
  }

  /**
   * Handle trade update
   */
  private handleTradeUpdate(_data: any): void {
    // Trade data could be used for volume tracking
    // For now, we emit it for potential future use
  }

  /**
   * Handle error message
   */
  private handleErrorMessage(error: any): void {
    this.emit('error', new Error(`Kalshi WS error: ${JSON.stringify(error)}`));
  }

  /**
   * Send subscribe message
   */
  protected async sendSubscribe(marketId: string): Promise<void> {
    this.send({
      id: ++this.messageSeq,
      cmd: 'subscribe',
      params: {
        channels: ['orderbook_delta'],
        market_ticker: marketId
      }
    });
  }

  /**
   * Send unsubscribe message
   */
  protected async sendUnsubscribe(marketId: string): Promise<void> {
    this.send({
      id: ++this.messageSeq,
      cmd: 'unsubscribe',
      params: {
        channels: ['orderbook_delta'],
        market_ticker: marketId
      }
    });
  }

  /**
   * Send heartbeat
   */
  protected sendHeartbeat(): void {
    if (this.isConnected()) {
      this.send({
        id: ++this.messageSeq,
        cmd: 'ping'
      });
    }
  }

  /**
   * Subscribe to multiple markets at once
   */
  async subscribeMultiple(marketIds: string[]): Promise<void> {
    for (const marketId of marketIds) {
      await this.subscribe(marketId);
    }
  }
}
