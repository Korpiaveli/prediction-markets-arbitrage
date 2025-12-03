import {
  Market,
  Quote,
  ExchangeName,
  ExchangeConfig,
  OrderRequest,
  OrderResult,
  OrderStatus,
  Balance
} from '@arb/core';
import { BaseExchange } from '../base/BaseExchange.js';

export class MockExchange extends BaseExchange {
  readonly name: ExchangeName = 'MOCK';
  readonly apiUrl = 'https://mock.exchange.com';

  private mockMarkets: Market[] = [
    {
      id: 'MOCK_NFL_GAME',
      exchangeId: 'MOCK_NFL_GAME',
      exchange: 'MOCK',
      title: 'Raiders beat Cowboys',
      description: 'Will the Raiders beat the Cowboys in the upcoming game?',
      active: true,
      volume24h: 50000,
      openInterest: 10000
    },
    {
      id: 'MOCK_ELECTION',
      exchangeId: 'MOCK_ELECTION',
      exchange: 'MOCK',
      title: 'Presidential Election 2024',
      description: 'Who will win the 2024 presidential election?',
      active: true,
      volume24h: 100000,
      openInterest: 50000
    }
  ];

  constructor(config: ExchangeConfig = {}) {
    super(config);
  }

  async getMarkets(): Promise<Market[]> {
    await this.delay(100); // Simulate network delay
    return this.mockMarkets;
  }

  async getMarket(marketId: string): Promise<Market | null> {
    await this.delay(50);
    return this.mockMarkets.find(m => m.id === marketId) || null;
  }

  async getQuote(marketId: string): Promise<Quote> {
    await this.delay(50);

    // 30% chance of generating an arbitrage opportunity for testing
    const generateArb = Math.random() < 0.3;

    let yesBid: number, yesAsk: number, noBid: number, noAsk: number;

    if (generateArb) {
      // Create prices that allow arbitrage
      // For example: YES ask + NO ask < 1.0
      yesAsk = 0.45 + Math.random() * 0.05; // 0.45-0.50
      noAsk = 0.45 + Math.random() * 0.05;  // 0.45-0.50
      yesBid = yesAsk - 0.02;
      noBid = noAsk - 0.02;
    } else {
      // Normal market prices
      const yesBase = 0.3 + Math.random() * 0.4; // 0.3 to 0.7
      const spread = 0.01 + Math.random() * 0.02; // 0.01 to 0.03

      yesBid = this.normalizePrice(yesBase - spread);
      yesAsk = this.normalizePrice(yesBase + spread);

      // NO prices should roughly complement YES prices
      const noBase = 1 - yesBase;
      noBid = this.normalizePrice(noBase - spread);
      noAsk = this.normalizePrice(noBase + spread);
    }

    return {
      marketId,
      exchange: this.name,
      timestamp: new Date(),
      yes: {
        bid: yesBid,
        ask: yesAsk,
        mid: (yesBid + yesAsk) / 2,
        liquidity: 1000 + Math.random() * 9000
      },
      no: {
        bid: noBid,
        ask: noAsk,
        mid: (noBid + noAsk) / 2,
        liquidity: 1000 + Math.random() * 9000
      },
      lastUpdate: new Date()
    };
  }

  // Generate quote with arbitrage opportunity
  async getArbitrageQuote(profitable: boolean = true): Promise<Quote> {
    await this.delay(10);

    if (profitable) {
      // Create prices that sum to less than 1 (arbitrage opportunity)
      return {
        marketId: 'MOCK_ARB',
        exchange: this.name,
        timestamp: new Date(),
        yes: {
          bid: 0.44,
          ask: 0.45,
          mid: 0.445,
          liquidity: 5000
        },
        no: {
          bid: 0.49,
          ask: 0.50,
          mid: 0.495,
          liquidity: 5000
        },
        lastUpdate: new Date()
      };
    } else {
      // Normal market (no arbitrage)
      return {
        marketId: 'MOCK_NORMAL',
        exchange: this.name,
        timestamp: new Date(),
        yes: {
          bid: 0.59,
          ask: 0.60,
          mid: 0.595,
          liquidity: 3000
        },
        no: {
          bid: 0.39,
          ask: 0.40,
          mid: 0.395,
          liquidity: 3000
        },
        lastUpdate: new Date()
      };
    }
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    await this.delay(100);
    return {
      orderId: `MOCK_ORDER_${Date.now()}`,
      status: 'filled',
      filledSize: order.size,
      filledPrice: order.price,
      timestamp: new Date()
    };
  }

  async cancelOrder(_orderId: string): Promise<void> {
    await this.delay(50);
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    await this.delay(50);
    return {
      orderId,
      status: 'filled',
      filledSize: 100,
      remainingSize: 0,
      averagePrice: 0.5,
      lastUpdate: new Date()
    };
  }

  async getAccountBalance(): Promise<Balance> {
    await this.delay(50);
    return {
      available: 10000,
      allocated: 2000,
      total: 12000,
      currency: 'USD'
    };
  }
}