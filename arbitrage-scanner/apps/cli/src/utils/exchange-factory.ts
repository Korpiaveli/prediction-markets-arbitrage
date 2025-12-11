import { IExchange } from '@arb/core';
import { KalshiAdapter, PolymarketAdapter, PredictItAdapter } from '@arb/exchanges';

export interface ExchangeFactoryOptions {
  exchanges?: string[];
  filterSports?: boolean;
  testMode?: boolean;
}

export type ExchangeName = 'kalshi' | 'polymarket' | 'predictit';

export class ExchangeFactory {
  private static readonly AVAILABLE_EXCHANGES: Record<ExchangeName, {
    name: string;
    description: string;
    supportsHistorical: boolean;
    usAccessible: boolean;
  }> = {
    kalshi: {
      name: 'Kalshi',
      description: 'CFTC-regulated prediction market (US politics, economy, sports)',
      supportsHistorical: true,
      usAccessible: true
    },
    polymarket: {
      name: 'Polymarket',
      description: 'Crypto-based prediction market (global events, crypto, sports)',
      supportsHistorical: false,
      usAccessible: true
    },
    predictit: {
      name: 'PredictIt',
      description: 'CFTC-approved political prediction market (US politics only)',
      supportsHistorical: false,
      usAccessible: true
    }
  };

  static listAvailable(): void {
    console.log('\nAvailable Exchanges:\n');
    Object.entries(this.AVAILABLE_EXCHANGES).forEach(([key, info]) => {
      const status = info.usAccessible ? '✓ US' : '✗ Geo-blocked';
      const historical = info.supportsHistorical ? '✓ Historical API' : '✗ No historical';
      console.log(`  ${key.padEnd(12)} ${info.name.padEnd(20)} ${status.padEnd(10)} ${historical}`);
      console.log(`  ${' '.repeat(12)} ${info.description}`);
      console.log('');
    });
  }

  static getInfo(exchange: ExchangeName) {
    return this.AVAILABLE_EXCHANGES[exchange];
  }

  static create(options: ExchangeFactoryOptions = {}): IExchange[] {
    const { exchanges = ['kalshi', 'predictit'], filterSports = false, testMode = false } = options;
    const instances: IExchange[] = [];

    for (const exchangeName of exchanges) {
      const exchange = this.createExchange(exchangeName as ExchangeName, {
        filterSports,
        testMode
      });

      if (exchange) {
        instances.push(exchange);
      }
    }

    return instances;
  }

  static createExchange(name: ExchangeName, options: { filterSports?: boolean; testMode?: boolean } = {}): IExchange | null {
    const { filterSports = false, testMode = false } = options;

    switch (name) {
      case 'kalshi':
        return new KalshiAdapter({
          filterSports,
          testMode
        });

      case 'polymarket':
        return new PolymarketAdapter({
          testMode
        });

      case 'predictit':
        return new PredictItAdapter({
          testMode
        });

      default:
        console.error(`[ExchangeFactory] Unknown exchange: ${name}`);
        return null;
    }
  }

  static generateExchangePairs(exchanges: IExchange[]): Array<[IExchange, IExchange]> {
    const pairs: Array<[IExchange, IExchange]> = [];

    for (let i = 0; i < exchanges.length; i++) {
      for (let j = i + 1; j < exchanges.length; j++) {
        pairs.push([exchanges[i], exchanges[j]]);
      }
    }

    return pairs;
  }

  static parseExchangeList(input: string): ExchangeName[] {
    const requested = input.toLowerCase().split(',').map(s => s.trim());
    const valid: ExchangeName[] = [];
    const invalid: string[] = [];

    for (const name of requested) {
      if (name in this.AVAILABLE_EXCHANGES) {
        valid.push(name as ExchangeName);
      } else {
        invalid.push(name);
      }
    }

    if (invalid.length > 0) {
      console.warn(`[ExchangeFactory] Invalid exchanges: ${invalid.join(', ')}`);
      console.log(`Valid options: ${Object.keys(this.AVAILABLE_EXCHANGES).join(', ')}`);
    }

    return valid;
  }

  static async connectAll(exchanges: IExchange[]): Promise<void> {
    const promises = exchanges.map(async (exchange) => {
      try {
        await exchange.connect();
        console.log(`[${exchange.name}] Connected`);
      } catch (error) {
        console.error(`[${exchange.name}] Connection failed:`, error);
        throw error;
      }
    });

    await Promise.all(promises);
  }

  static async disconnectAll(exchanges: IExchange[]): Promise<void> {
    const promises = exchanges.map(async (exchange) => {
      try {
        await exchange.disconnect();
        console.log(`[${exchange.name}] Disconnected`);
      } catch (error) {
        console.error(`[${exchange.name}] Disconnect failed:`, error);
      }
    });

    await Promise.all(promises);
  }
}
