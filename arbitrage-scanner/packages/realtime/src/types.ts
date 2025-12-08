/**
 * Real-time Module Type Definitions
 */

import { Market } from '@arb/core';

/**
 * WebSocket connection state
 */
export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  FAILED = 'FAILED'
}

/**
 * WebSocket configuration
 */
export interface WebSocketConfig {
  url: string;
  apiKey?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  subscribeOnConnect?: string[];
}

/**
 * Price update event
 */
export interface PriceUpdate {
  marketId: string;
  exchange: 'KALSHI' | 'POLYMARKET';
  timestamp: Date;
  yes: {
    bid: number;
    ask: number;
    mid: number;
  };
  no: {
    bid: number;
    ask: number;
    mid: number;
  };
  volume24h?: number;
}

/**
 * Resolution timing status
 */
export interface ResolutionTimingStatus {
  marketId: string;
  exchange: 'KALSHI' | 'POLYMARKET' | 'PREDICTIT' | 'MANIFOLD';
  resolutionDate?: Date;
  isImminent: boolean;        // Resolution within 24 hours
  hoursUntilResolution?: number;
  status: 'active' | 'resolving' | 'resolved' | 'voided';
}

/**
 * Resolution event from exchange
 */
export interface ResolutionEvent {
  marketId: string;
  exchange: 'KALSHI' | 'POLYMARKET' | 'PREDICTIT' | 'MANIFOLD';
  eventType: 'resolution_imminent' | 'resolved' | 'voided' | 'disputed';
  timestamp: Date;
  outcome?: 'YES' | 'NO' | 'VOID';
  details?: string;
}

/**
 * WebSocket event types
 */
export type WebSocketEvent =
  | { type: 'connected' }
  | { type: 'disconnected'; reason?: string }
  | { type: 'error'; error: Error }
  | { type: 'price_update'; update: PriceUpdate }
  | { type: 'market_update'; market: Market }
  | { type: 'subscribed'; marketId: string }
  | { type: 'unsubscribed'; marketId: string }
  | { type: 'resolution_event'; event: ResolutionEvent }
  | { type: 'resolution_imminent'; timing: ResolutionTimingStatus };

/**
 * Cache configuration
 */
export interface CacheConfig {
  host?: string;
  port?: number;
  password?: string;
  ttl?: {
    quotes?: number;        // Default: 5 seconds
    markets?: number;       // Default: 60 seconds
    opportunities?: number; // Default: 30 seconds
  };
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  discord?: {
    webhookUrl: string;
    enabled?: boolean;
    minProfitPercent?: number;
  };
  telegram?: {
    botToken: string;
    chatId: string;
    enabled?: boolean;
    minProfitPercent?: number;
  };
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  scanner: {
    lastScanDuration: number;
    avgScanDuration: number;
    scansPerMinute: number;
    opportunitiesFound: number;
  };
  websocket: {
    messagesReceived: number;
    messagesPerSecond: number;
    connectionUptime: number;
    reconnects: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
  };
  latency: {
    quoteLatency: number;      // ms
    scanLatency: number;        // ms
    alertLatency: number;       // ms
  };
}
