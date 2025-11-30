/**
 * Performance Metrics Tracker
 *
 * Tracks latency, throughput, cache performance, and system health.
 */

import { PerformanceMetrics } from '../types';

export class MetricsTracker {
  private scanDurations: number[] = [];
  private opportunitiesFound = 0;
  private scanCount = 0;
  private scanStartTime?: number;

  private wsMessagesReceived = 0;
  private wsMessageTimes: number[] = [];
  private connectionStartTime?: number;
  private reconnectCount = 0;

  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheEvictions = 0;

  private latencyMeasurements: Map<string, number[]> = new Map();

  private startTime = Date.now();

  /**
   * Record scan start
   */
  startScan(): void {
    this.scanStartTime = Date.now();
  }

  /**
   * Record scan completion
   */
  endScan(opportunitiesCount: number): void {
    if (!this.scanStartTime) return;

    const duration = Date.now() - this.scanStartTime;
    this.scanDurations.push(duration);
    this.opportunitiesFound += opportunitiesCount;
    this.scanCount++;

    // Keep only last 100 scans
    if (this.scanDurations.length > 100) {
      this.scanDurations.shift();
    }

    this.scanStartTime = undefined;
  }

  /**
   * Record WebSocket message received
   */
  recordWebSocketMessage(): void {
    this.wsMessagesReceived++;
    this.wsMessageTimes.push(Date.now());

    // Keep only last minute of message times
    const oneMinuteAgo = Date.now() - 60000;
    this.wsMessageTimes = this.wsMessageTimes.filter(t => t > oneMinuteAgo);
  }

  /**
   * Record connection start
   */
  connectionStarted(): void {
    this.connectionStartTime = Date.now();
  }

  /**
   * Record reconnection
   */
  reconnected(): void {
    this.reconnectCount++;
  }

  /**
   * Record cache hit
   */
  cacheHit(): void {
    this.cacheHits++;
  }

  /**
   * Record cache miss
   */
  cacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * Record cache eviction
   */
  cacheEviction(): void {
    this.cacheEvictions++;
  }

  /**
   * Record latency measurement
   */
  recordLatency(operation: string, duration: number): void {
    if (!this.latencyMeasurements.has(operation)) {
      this.latencyMeasurements.set(operation, []);
    }

    const measurements = this.latencyMeasurements.get(operation)!;
    measurements.push(duration);

    // Keep only last 100 measurements
    if (measurements.length > 100) {
      measurements.shift();
    }
  }

  /**
   * Measure operation latency
   */
  async measure<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      const duration = Date.now() - start;
      this.recordLatency(operation, duration);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    const scansPerMinute = this.calculateScansPerMinute();
    const avgScanDuration = this.calculateAverage(this.scanDurations);
    const lastScanDuration = this.scanDurations.length > 0
      ? this.scanDurations[this.scanDurations.length - 1]
      : 0;

    const messagesPerSecond = this.wsMessageTimes.length / 60; // Last minute
    const uptime = this.connectionStartTime
      ? Date.now() - this.connectionStartTime
      : 0;

    const totalCacheOps = this.cacheHits + this.cacheMisses;
    const hitRate = totalCacheOps > 0 ? (this.cacheHits / totalCacheOps) * 100 : 0;

    return {
      scanner: {
        lastScanDuration,
        avgScanDuration,
        scansPerMinute,
        opportunitiesFound: this.opportunitiesFound
      },
      websocket: {
        messagesReceived: this.wsMessagesReceived,
        messagesPerSecond,
        connectionUptime: uptime,
        reconnects: this.reconnectCount
      },
      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate,
        evictions: this.cacheEvictions
      },
      latency: {
        quoteLatency: this.getAverageLatency('quote'),
        scanLatency: this.getAverageLatency('scan'),
        alertLatency: this.getAverageLatency('alert')
      }
    };
  }

  /**
   * Calculate scans per minute
   */
  private calculateScansPerMinute(): number {
    const uptime = Date.now() - this.startTime;
    const minutes = uptime / 60000;
    return minutes > 0 ? this.scanCount / minutes : 0;
  }

  /**
   * Calculate average
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Get average latency for operation
   */
  private getAverageLatency(operation: string): number {
    const measurements = this.latencyMeasurements.get(operation);
    if (!measurements || measurements.length === 0) return 0;
    return this.calculateAverage(measurements);
  }

  /**
   * Get formatted metrics report
   */
  getReport(): string {
    const metrics = this.getMetrics();

    return `
Performance Metrics Report
${'='.repeat(50)}

Scanner:
  Last Scan:       ${metrics.scanner.lastScanDuration}ms
  Avg Scan:        ${metrics.scanner.avgScanDuration.toFixed(0)}ms
  Scans/Min:       ${metrics.scanner.scansPerMinute.toFixed(2)}
  Opportunities:   ${metrics.scanner.opportunitiesFound}

WebSocket:
  Messages:        ${metrics.websocket.messagesReceived}
  Msgs/Sec:        ${metrics.websocket.messagesPerSecond.toFixed(2)}
  Uptime:          ${(metrics.websocket.connectionUptime / 1000).toFixed(0)}s
  Reconnects:      ${metrics.websocket.reconnects}

Cache:
  Hits:            ${metrics.cache.hits}
  Misses:          ${metrics.cache.misses}
  Hit Rate:        ${metrics.cache.hitRate.toFixed(1)}%
  Evictions:       ${metrics.cache.evictions}

Latency:
  Quote:           ${metrics.latency.quoteLatency.toFixed(0)}ms
  Scan:            ${metrics.latency.scanLatency.toFixed(0)}ms
  Alert:           ${metrics.latency.alertLatency.toFixed(0)}ms

${'='.repeat(50)}
`.trim();
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.scanDurations = [];
    this.opportunitiesFound = 0;
    this.scanCount = 0;

    this.wsMessagesReceived = 0;
    this.wsMessageTimes = [];
    this.reconnectCount = 0;

    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.cacheEvictions = 0;

    this.latencyMeasurements.clear();

    this.startTime = Date.now();
  }
}
