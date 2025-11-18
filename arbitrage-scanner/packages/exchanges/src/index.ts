export { BaseExchange } from './base/BaseExchange.js';
export { KalshiAdapter } from './kalshi/KalshiAdapter.js';
export { PolymarketAdapter } from './polymarket/PolymarketAdapter.js';
export { MockExchange } from './mock/MockExchange.js';

// Re-import for factory functions
import { KalshiAdapter } from './kalshi/KalshiAdapter.js';
import { PolymarketAdapter } from './polymarket/PolymarketAdapter.js';
import { MockExchange } from './mock/MockExchange.js';
import { ExchangeConfig } from '@arb/core';

// Factory functions
export function createKalshiAdapter(config?: ExchangeConfig) {
  return new KalshiAdapter(config);
}

export function createPolymarketAdapter(config?: ExchangeConfig) {
  return new PolymarketAdapter(config);
}

export function createMockExchange(config?: ExchangeConfig) {
  return new MockExchange(config);
}