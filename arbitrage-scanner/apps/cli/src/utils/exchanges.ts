import { IExchange } from '@arb/core';
import { KalshiAdapter, PolymarketAdapter, PredictItAdapter, ManifoldAdapter } from '@arb/exchanges';

export interface ExchangeFactoryOptions {
  includeKalshi?: boolean;
  includePolymarket?: boolean;
  includePredictIt?: boolean;
  includeManifold?: boolean;
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
    includeManifold = false,
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

  if (includeManifold) {
    exchanges.push(new ManifoldAdapter({
      excludeResolved: true,
      minVolume: 100
    }));
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
  includeManifold: boolean;
} {
  const exchanges = exchangeList.toLowerCase().split(',').map(e => e.trim());

  return {
    includeKalshi: exchanges.includes('kalshi'),
    includePolymarket: exchanges.includes('polymarket'),
    includePredictIt: exchanges.includes('predictit'),
    includeManifold: exchanges.includes('manifold')
  };
}

/**
 * Get all available exchange names
 */
export function getAvailableExchanges(): string[] {
  return ['kalshi', 'polymarket', 'predictit', 'manifold'];
}
