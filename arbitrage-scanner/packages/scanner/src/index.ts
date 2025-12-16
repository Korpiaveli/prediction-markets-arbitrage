export { Scanner } from './Scanner.js';
export {
  MarketMatcher,
  type MatchAnalysis,
  type MatcherConfig
} from './MarketMatcher.js';
export { OpportunityRanker, type RankingCriteria } from './OpportunityRanker.js';
export {
  CapitalTurnoverRanker,
  STRATEGY_PRESETS,
  type TurnoverStrategy,
  type TurnoverWeights,
  type StrategyConfig,
  type RankedOpportunity,
  type TurnoverScore,
  type CompoundingProjection
} from './CapitalTurnoverRanker.js';
export {
  type PriceCandidate,
  type PriceScreenConfig,
  type PriceSignal,
  type PriceCombo,
  type ValidationResult,
  type ArbitrageScanResult,
  type ArbitrageOpportunity,
  DEFAULT_PRICE_SCREEN_CONFIG
} from './types.js';
export { PriceFirstScanner } from './PriceFirstScanner.js';

// Factory function
import { ScannerConfig } from '@arb/core';
import { Scanner } from './Scanner.js';

export function createScanner(config: ScannerConfig): Scanner {
  return new Scanner(config);
}