export type {
  ScoringStrategy,
  FeatureWeights,
  ScoringThresholds
} from './ScoringStrategy';
export { BaseScoringStrategy } from './ScoringStrategy';

export { KalshiPolymarketStrategy } from './KalshiPolymarketStrategy';
export { KalshiPredictItStrategy } from './KalshiPredictItStrategy';
export { KalshiDraftKingsStrategy } from './KalshiDraftKingsStrategy';

import { BaseScoringStrategy } from './ScoringStrategy.js';
import { KalshiPredictItStrategy as KPStrategy } from './KalshiPredictItStrategy.js';
import { KalshiPolymarketStrategy as KPolyStrategy } from './KalshiPolymarketStrategy.js';
import { KalshiDraftKingsStrategy as KDKStrategy } from './KalshiDraftKingsStrategy.js';

/**
 * Strategy Factory
 * Selects the optimal scoring strategy based on exchange pair
 */
export function getStrategy(exchange1: string, exchange2: string): BaseScoringStrategy {
  const pair = `${exchange1}-${exchange2}`.toLowerCase();

  switch (pair) {
    case 'kalshi-predictit':
    case 'predictit-kalshi':
      return new KPStrategy();

    case 'kalshi-polymarket':
    case 'polymarket-kalshi':
      return new KPolyStrategy();

    case 'kalshi-draftkings':
    case 'draftkings-kalshi':
      return new KDKStrategy();

    case 'polymarket-draftkings':
    case 'draftkings-polymarket':
      return new KDKStrategy();

    case 'predictit-draftkings':
    case 'draftkings-predictit':
      return new KDKStrategy();

    default:
      console.log(`[Strategy Factory] No specific strategy for ${pair}, using KalshiPolymarketStrategy as fallback`);
      return new KPolyStrategy();
  }
}
