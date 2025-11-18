export { BaseExchange } from './base/BaseExchange.js';
export { KalshiAdapter } from './kalshi/KalshiAdapter.js';
export { PolymarketAdapter } from './polymarket/PolymarketAdapter.js';
export { MockExchange } from './mock/MockExchange.js';

// Factory functions
export function createKalshiAdapter(config?: any) {
  return new KalshiAdapter(config);
}

export function createPolymarketAdapter(config?: any) {
  return new PolymarketAdapter(config);
}

export function createMockExchange(config?: any) {
  return new MockExchange(config);
}