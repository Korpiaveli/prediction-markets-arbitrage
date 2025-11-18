export { Scanner } from './Scanner.js';
export {
  MarketMatcher,
  type MatchAnalysis,
  type MatcherConfig
} from './MarketMatcher.js';
export { OpportunityRanker, type RankingCriteria } from './OpportunityRanker.js';

// Factory function
import { ScannerConfig } from '@arb/core';
import { Scanner } from './Scanner.js';

export function createScanner(config: ScannerConfig): Scanner {
  return new Scanner(config);
}