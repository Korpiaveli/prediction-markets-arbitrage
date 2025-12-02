import { IExchange } from '@arb/core';
import { KalshiAdapter, PolymarketAdapter, PredictItAdapter } from '@arb/exchanges';

export interface ExchangeFactoryOptions {
  includeKalshi?: boolean;
  includePolymarket?: boolean;
  includePredictIt?: boolean;
  filterSports?: boolean;
  testMode?: boolean;
}

/**
 * Create exchange instances based on options
 * Replaces hardcoded exchange creation with flexible factory
 */
export function createExchanges(options: ExchangeFactoryOptions = {}): IExchange[] {
  const {
    includeKalshi = true,
    includePolymarket = true,
    includePredictIt = false,
    filterSports = false,
    testMode = false
  } = options;

  const exchanges: IExchange[] = [];

  if (includeKalshi) {
    exchanges.push(new KalshiAdapter({
      filterSports,
      testMode
    }));
  }

  if (includePolymarket) {
    exchanges.push(new PolymarketAdapter({ testMode }));
  }

  if (includePredictIt) {
    exchanges.push(new PredictItAdapter({ testMode }));
  }

  return exchanges;
}

/**
 * Parse comma-separated exchange list to boolean options
 */
export function parseExchangeList(exchangeList: string): {
  includeKalshi: boolean;
  includePolymarket: boolean;
  includePredictIt: boolean;
} {
  const exchanges = exchangeList.toLowerCase().split(',').map(e => e.trim());

  return {
    includeKalshi: exchanges.includes('kalshi'),
    includePolymarket: exchanges.includes('polymarket'),
    includePredictIt: exchanges.includes('predictit')
  };
}

/**
 * Get all available exchange names
 */
export function getAvailableExchanges(): string[] {
  return ['kalshi', 'polymarket', 'predictit'];
}
