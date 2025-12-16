/**
 * @arb/historical - Real Historical Data Backtesting System
 *
 * Production backtesting with real API data from Kalshi/Polymarket:
 * - Historical price data collection with rate limiting
 * - Resolution tracking and outcome verification
 * - Multi-interval reporting (daily/weekly/monthly/semi-annual/annual)
 * - User-configurable capital and simulation duration
 */

// Types
export * from './types.js';

// Collectors
export { RateLimitedQueue, createQueueForExchange } from './collectors/RateLimitedQueue.js';
export { HistoricalCollector, createHistoricalCollector } from './collectors/HistoricalCollector.js';
export type { CollectorConfig } from './collectors/HistoricalCollector.js';

// Storage
export { HistoricalStore, createHistoricalStore } from './storage/HistoricalStore.js';
export type { HistoricalStoreConfig } from './storage/HistoricalStore.js';

// Resolution Tracking
export { ResolutionTracker, createResolutionTracker } from './resolution/ResolutionTracker.js';
export type { ResolutionTrackerConfig, ResolutionAlignmentRisk, ResolutionAlignmentResult } from './resolution/ResolutionTracker.js';

// Backtest Engine
export { RealDataBacktestEngine, createRealDataBacktestEngine } from './backtest/RealDataBacktestEngine.js';

// Reporting
export { IntervalReporter, createIntervalReporter } from './reporting/IntervalReporter.js';
