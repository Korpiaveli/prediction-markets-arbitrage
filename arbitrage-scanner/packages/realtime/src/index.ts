/**
 * @arb/realtime - Real-time Price Feeds & WebSocket Management
 *
 * Provides WebSocket connections, Redis caching, and alert system
 * for sub-2-second arbitrage detection.
 */

export { BaseWebSocketManager } from './websocket/base';
export { KalshiWebSocket } from './websocket/kalshi';
export { PolymarketWebSocket } from './websocket/polymarket';
export { CacheManager } from './cache/manager';
export { AlertService } from './alerts/service';
export { MetricsTracker } from './metrics/tracker';
export { RealTimeScanner } from './scanner/realtime';
export { ResolutionMonitor } from './monitor/ResolutionMonitor';

export type { ArbitrageAlert } from './alerts/service';
export type {
  MonitoredPosition,
  ResolutionAlert
} from './monitor/ResolutionMonitor';
export type {
  ConnectionState,
  WebSocketConfig,
  PriceUpdate,
  WebSocketEvent,
  CacheConfig,
  AlertConfig,
  PerformanceMetrics,
  ResolutionTimingStatus,
  ResolutionEvent
} from './types';
