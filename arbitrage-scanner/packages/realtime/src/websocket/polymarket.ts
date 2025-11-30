/**
 * Polymarket WebSocket Adapter
 *
 * Connects to Polymarket CLOB WebSocket for real-time order book updates.
 * API Docs: https://docs.polymarket.com
 */

import { BaseWebSocketManager } from './base';
import { WebSocketConfig, PriceUpdate } from '../types';

interface PolymarketWebSocketMessage {
  event_type: string;
  market?: string;
  asset_id?: string;
  data?: any;
}

interface PolymarketOrderbook {
  bids: Array<[string, string]>; // [price, size]
  asks: Array<[string, string]>;
  timestamp: number;
}

export class PolymarketWebSocket extends BaseWebSocketManager {
  private subscriptionId = 0;

  constructor(config: Partial<WebSocketConfig> = {}) {
    super({
      url: config.url || 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
      apiKey: config.apiKey,
      reconnect: config.reconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 5000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      subscribeOnConnect: config.subscribeOnConnect || []
    });
  }

  /**
   * Process incoming message from Polymarket WebSocket
   */
  protected processMessage(message: PolymarketWebSocketMessage): void {
    switch (message.event_type) {
      case 'book':
        this.handleOrderbookUpdate(message);
        break;

      case 'trade':
        this.handleTradeUpdate(message);
        break;

      case 'tick':
        this.handleTickUpdate(message);
        break;

      case 'subscribed':
        this.handleSubscribed(message);
        break;

      case 'unsubscribed':
        this.handleUnsubscribed(message);
        break;

      case 'error':
        this.handleErrorMessage(message);
        break;

      default:
        // Unknown message type
        break;
    }
  }

  /**
   * Handle orderbook update
   */
  private handleOrderbookUpdate(message: PolymarketWebSocketMessage): void {
    if (!message.asset_id || !message.data) return;

    const data = message.data as PolymarketOrderbook;

    // Get best bid/ask from orderbook
    const bestBid = data.bids.length > 0 ? parseFloat(data.bids[0][0]) : 0;
    const bestAsk = data.asks.length > 0 ? parseFloat(data.asks[0][0]) : 0;
    const mid = (bestBid + bestAsk) / 2;

    // Polymarket uses outcome tokens, so we need to calculate NO prices
    // NO price = 1 - YES price
    const update: PriceUpdate = {
      marketId: message.asset_id,
      exchange: 'POLYMARKET',
      timestamp: new Date(data.timestamp),
      yes: {
        bid: bestBid,
        ask: bestAsk,
        mid: mid
      },
      no: {
        bid: 1 - bestAsk,
        ask: 1 - bestBid,
        mid: 1 - mid
      }
    };

    this.emit('price_update', update);
  }

  /**
   * Handle trade update
   */
  private handleTradeUpdate(_message: PolymarketWebSocketMessage): void {
    // Trade data for volume tracking
  }

  /**
   * Handle tick update (price change)
   */
  private handleTickUpdate(_message: PolymarketWebSocketMessage): void {
    // Tick data for price movements
  }

  /**
   * Handle subscription confirmation
   */
  private handleSubscribed(_message: PolymarketWebSocketMessage): void {
    // Subscription confirmed
  }

  /**
   * Handle unsubscription confirmation
   */
  private handleUnsubscribed(_message: PolymarketWebSocketMessage): void {
    // Unsubscription confirmed
  }

  /**
   * Handle error message
   */
  private handleErrorMessage(message: PolymarketWebSocketMessage): void {
    this.emit('error', new Error(`Polymarket WS error: ${JSON.stringify(message)}`));
  }

  /**
   * Send subscribe message
   */
  protected async sendSubscribe(marketId: string): Promise<void> {
    this.send({
      type: 'subscribe',
      channel: 'book',
      market: marketId,
      id: ++this.subscriptionId
    });
  }

  /**
   * Send unsubscribe message
   */
  protected async sendUnsubscribe(marketId: string): Promise<void> {
    this.send({
      type: 'unsubscribe',
      channel: 'book',
      market: marketId,
      id: ++this.subscriptionId
    });
  }

  /**
   * Send heartbeat (Polymarket uses ping/pong)
   */
  protected sendHeartbeat(): void {
    if (this.isConnected()) {
      this.send({ type: 'ping' });
    }
  }

  /**
   * Subscribe to multiple markets
   */
  async subscribeMultiple(marketIds: string[]): Promise<void> {
    for (const marketId of marketIds) {
      await this.subscribe(marketId);
    }
  }

  /**
   * Subscribe to market by token ID
   */
  async subscribeByToken(tokenId: string): Promise<void> {
    await this.subscribe(tokenId);
  }
}
