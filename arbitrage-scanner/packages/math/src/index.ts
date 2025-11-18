export { SafeDecimal } from './decimal.js';
export { ArbitrageCalculator } from './arbitrage.js';
export { FeeCalculator } from './fees.js';
export { ValidationService } from './validation.js';
export {
  ResolutionAnalyzer,
  type ResolutionCriteria,
  type ResolutionAlignment
} from './resolution.js';

// Convenience exports
export { ArbitrageCalculator as Calculator } from './arbitrage.js';

// Re-import for factory function
import { ArbitrageCalculator } from './arbitrage.js';

// Factory function for easy instantiation
export function createCalculator() {
  return new ArbitrageCalculator();
}