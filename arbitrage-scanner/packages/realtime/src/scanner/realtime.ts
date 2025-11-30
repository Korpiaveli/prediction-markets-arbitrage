/**
 * Real-Time Arbitrage Scanner
 *
 * Integrates WebSocket feeds, caching, scanning, and alerts
 * for sub-2-second opportunity detection.
 */

import { EventEmitter } from 'eventemitter3';
import { Scanner } from '@arb/scanner';
import { Quote, ScannerConfig } from '@arb/core';
import { KalshiWebSocket } from '../websocket/kalshi';
import { PolymarketWebSocket } from '../websocket/polymarket';
import { CacheManager } from '../cache/manager';
import { AlertService, ArbitrageAlert } from '../alerts/service';
import { MetricsTracker } from '../metrics/tracker';
import { PriceUpdate, CacheConfig, AlertConfig } from '../types';

export interface RealTimeScannerConfig {
  scanner: ScannerConfig;
  cache?: CacheConfig;
  alerts?: AlertConfig;
  kalshiApiKey?: string;
  polymarketApiKey?: string;
  scanThrottleMs?: number;
}

export class RealTimeScanner extends EventEmitter<{
  opportunity: (alert: ArbitrageAlert) => void;
  error: (error: Error) => void;
  metrics: (metrics: any) => void;
}> {
  private kalshiWs: KalshiWebSocket;
  private polyWs: PolymarketWebSocket;
  private cache: CacheManager;
  private scanner: Scanner;
  private alerts: AlertService;
  private metrics: MetricsTracker;

  private scanThrottleMs: number;
  private lastScanTime = 0;
  private pendingScan = false;

  private subscribedMarkets = new Map<string, { kalshi?: string; poly?: string }>();

  constructor(config: RealTimeScannerConfig) {
    super();

    this.scanThrottleMs = config.scanThrottleMs ?? 1000;

    this.kalshiWs = new KalshiWebSocket({
      apiKey: config.kalshiApiKey
    });

    this.polyWs = new PolymarketWebSocket({
      apiKey: config.polymarketApiKey
    });

    this.cache = new CacheManager(config.cache);
    this.scanner = new Scanner(config.scanner);
    this.alerts = new AlertService(config.alerts);
    this.metrics = new MetricsTracker();

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for WebSocket price updates
   */
  private setupEventHandlers(): void {
    this.kalshiWs.on('price_update', (update: PriceUpdate) => {
      this.handlePriceUpdate(update);
    });

    this.polyWs.on('price_update', (update: PriceUpdate) => {
      this.handlePriceUpdate(update);
    });

    this.kalshiWs.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.polyWs.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  /**
   * Handle price update from WebSocket
   */
  private async handlePriceUpdate(update: PriceUpdate): Promise<void> {
    try {
      const quote: Quote = {
        marketId: update.marketId,
        exchange: update.exchange,
        timestamp: update.timestamp,
        yes: {
          bid: update.yes.bid,
          ask: update.yes.ask,
          mid: update.yes.mid,
          liquidity: update.volume24h
        },
        no: {
          bid: update.no.bid,
          ask: update.no.ask,
          mid: update.no.mid,
          liquidity: update.volume24h
        },
        lastUpdate: update.timestamp
      };

      await this.cache.cacheQuote(update.marketId, update.exchange, quote);

      this.throttledScan();
    } catch (error) {
      this.emit('error', error as Error);
    }
  }

  /**
   * Throttled scan to avoid overwhelming the system
   */
  private throttledScan(): void {
    const now = Date.now();
    const timeSinceLastScan = now - this.lastScanTime;

    if (timeSinceLastScan >= this.scanThrottleMs) {
      this.executeScan();
    } else if (!this.pendingScan) {
      this.pendingScan = true;
      setTimeout(() => {
        this.pendingScan = false;
        this.executeScan();
      }, this.scanThrottleMs - timeSinceLastScan);
    }
  }

  /**
   * Execute scan with performance tracking
   */
  private async executeScan(): Promise<void> {
    this.lastScanTime = Date.now();
    this.metrics.startScan();

    try {
      const opportunities = await this.metrics.measure('scan', async () => {
        return await this.scanner.scan();
      });

      this.metrics.endScan(opportunities.length);

      for (const opp of opportunities) {
        const alert: ArbitrageAlert = {
          opportunityId: opp.id,
          kalshiMarket: opp.marketPair.kalshiMarket.title,
          polymarketMarket: opp.marketPair.polymarketMarket.title,
          profitPercent: opp.profitPercent,
          investmentRequired: opp.totalCost,
          direction: opp.direction,
          timestamp: opp.timestamp,
          confidence: opp.confidence,
          resolutionRisk: opp.resolutionAlignment ?
            `${opp.resolutionAlignment.level.toUpperCase()} (Score: ${opp.resolutionAlignment.score})` :
            undefined
        };

        await this.metrics.measure('alert', async () => {
          await this.alerts.sendOpportunityAlert(alert);
        });

        this.emit('opportunity', alert);

        await this.cache.cacheOpportunity(alert.opportunityId, alert);
        await this.cache.addOpportunityToRecent(alert);
      }
    } catch (error) {
      this.emit('error', error as Error);
    }
  }

  /**
   * Start real-time scanner
   */
  async start(): Promise<void> {
    await this.cache.connect();
    this.metrics.connectionStarted();

    await this.kalshiWs.connect();
    await this.polyWs.connect();

    this.emit('metrics', this.metrics.getMetrics());
  }

  /**
   * Stop real-time scanner
   */
  async stop(): Promise<void> {
    await this.kalshiWs.disconnect();
    await this.polyWs.disconnect();
    await this.cache.disconnect();
  }

  /**
   * Subscribe to market pair
   */
  async subscribeToMarketPair(kalshiTicker: string, polyTokenId: string): Promise<void> {
    const pairId = `${kalshiTicker}-${polyTokenId}`;
    this.subscribedMarkets.set(pairId, {
      kalshi: kalshiTicker,
      poly: polyTokenId
    });

    await this.kalshiWs.subscribe(kalshiTicker);
    await this.polyWs.subscribe(polyTokenId);
  }

  /**
   * Subscribe to multiple market pairs
   */
  async subscribeToMarketPairs(pairs: Array<{ kalshi: string; poly: string }>): Promise<void> {
    const kalshiTickers = pairs.map(p => p.kalshi);
    const polyTokenIds = pairs.map(p => p.poly);

    await this.kalshiWs.subscribeMultiple(kalshiTickers);
    await this.polyWs.subscribeMultiple(polyTokenIds);

    for (const pair of pairs) {
      const pairId = `${pair.kalshi}-${pair.poly}`;
      this.subscribedMarkets.set(pairId, pair);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }

  /**
   * Get formatted metrics report
   */
  getReport(): string {
    return this.metrics.getReport();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Get alert statistics
   */
  getAlertStats() {
    return this.alerts.getStats();
  }

  /**
   * Get recent opportunities from cache
   */
  async getRecentOpportunities(limit = 10) {
    return await this.cache.getRecentOpportunities(limit);
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    await this.cache.clearAll();
  }

  /**
   * Send test alert
   */
  async sendTestAlert(): Promise<void> {
    await this.alerts.sendTestAlert();
  }
}
