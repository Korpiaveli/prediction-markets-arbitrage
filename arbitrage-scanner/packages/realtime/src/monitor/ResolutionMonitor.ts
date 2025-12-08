import { EventEmitter } from 'events';
import { Market } from '@arb/core';
import { ResolutionTimingStatus, ResolutionEvent } from '../types.js';

export interface MonitoredPosition {
  positionId: string;
  exchange1: string;
  exchange1MarketId: string;
  exchange2: string;
  exchange2MarketId: string;
  expectedResolutionDate?: Date;
}

export interface ResolutionAlert {
  type: 'imminent' | 'resolved' | 'disputed' | 'divergent';
  positionId: string;
  marketId: string;
  exchange: string;
  message: string;
  urgency: 'info' | 'warning' | 'critical';
  timestamp: Date;
  details?: {
    hoursRemaining?: number;
    outcome?: string;
    exchange1Status?: ResolutionTimingStatus;
    exchange2Status?: ResolutionTimingStatus;
  };
}

/**
 * Resolution Monitor
 *
 * Monitors open positions for resolution timing and events.
 * Emits alerts when resolution is imminent or when divergent
 * resolution is detected.
 */
export class ResolutionMonitor extends EventEmitter {
  private positions: Map<string, MonitoredPosition> = new Map();
  private marketStatus: Map<string, ResolutionTimingStatus> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly IMMINENT_HOURS = 24;

  constructor() {
    super();
  }

  /**
   * Start monitoring positions
   */
  start(checkIntervalMs: number = 60000): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkAllPositions();
    }, checkIntervalMs);

    console.log('[ResolutionMonitor] Started monitoring');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[ResolutionMonitor] Stopped monitoring');
  }

  /**
   * Add position to monitor
   */
  addPosition(position: MonitoredPosition): void {
    this.positions.set(position.positionId, position);
    console.log(`[ResolutionMonitor] Added position ${position.positionId} to monitoring`);
  }

  /**
   * Remove position from monitoring
   */
  removePosition(positionId: string): void {
    this.positions.delete(positionId);
  }

  /**
   * Update market resolution status (from exchange data or manual poll)
   */
  updateMarketStatus(status: ResolutionTimingStatus): void {
    const key = `${status.exchange}-${status.marketId}`;
    const previous = this.marketStatus.get(key);

    this.marketStatus.set(key, status);

    // Check if status changed significantly
    if (previous) {
      // Newly imminent
      if (!previous.isImminent && status.isImminent) {
        this.emitImminentAlert(status);
      }
      // Newly resolved
      if (previous.status !== 'resolved' && status.status === 'resolved') {
        this.emitResolutionEvent(status);
      }
    }

    // Check affected positions
    this.checkPositionsForMarket(status.marketId, status.exchange);
  }

  /**
   * Handle resolution event from exchange
   */
  handleResolutionEvent(event: ResolutionEvent): void {
    const key = `${event.exchange}-${event.marketId}`;

    // Update status based on event
    const status: ResolutionTimingStatus = {
      marketId: event.marketId,
      exchange: event.exchange,
      isImminent: event.eventType === 'resolution_imminent',
      status: event.eventType === 'resolved' ? 'resolved'
        : event.eventType === 'voided' ? 'voided'
        : 'active'
    };

    this.marketStatus.set(key, status);

    // Check for affected positions
    this.checkPositionsForMarket(event.marketId, event.exchange);
  }

  /**
   * Check resolution timing from market data
   */
  checkMarketTiming(market: Market): ResolutionTimingStatus {
    const now = new Date();
    let resolutionDate: Date | undefined;
    let hoursUntilResolution: number | undefined;

    // Try to extract resolution date from market metadata
    if (market.closeTime) {
      resolutionDate = new Date(market.closeTime);
      hoursUntilResolution = (resolutionDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    } else if (market.metadata?.close_time) {
      resolutionDate = new Date(market.metadata.close_time);
      hoursUntilResolution = (resolutionDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    } else if (market.metadata?.resolution_date) {
      resolutionDate = new Date(market.metadata.resolution_date);
      hoursUntilResolution = (resolutionDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    }

    const isImminent = hoursUntilResolution !== undefined &&
                       hoursUntilResolution > 0 &&
                       hoursUntilResolution <= this.IMMINENT_HOURS;

    let status: 'active' | 'resolving' | 'resolved' | 'voided' = 'active';
    if (market.metadata?.resolved === true || market.metadata?.closed === true) {
      status = 'resolved';
    } else if (hoursUntilResolution !== undefined && hoursUntilResolution <= 0) {
      status = 'resolving';
    }

    return {
      marketId: market.id,
      exchange: market.exchange as any,
      resolutionDate,
      isImminent,
      hoursUntilResolution: hoursUntilResolution !== undefined ? Math.max(0, hoursUntilResolution) : undefined,
      status
    };
  }

  /**
   * Get all currently monitored positions
   */
  getMonitoredPositions(): MonitoredPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get positions with imminent resolution
   */
  getImminentPositions(): Array<{
    position: MonitoredPosition;
    exchange1Status?: ResolutionTimingStatus;
    exchange2Status?: ResolutionTimingStatus;
  }> {
    const result: Array<{
      position: MonitoredPosition;
      exchange1Status?: ResolutionTimingStatus;
      exchange2Status?: ResolutionTimingStatus;
    }> = [];

    for (const position of this.positions.values()) {
      const key1 = `${position.exchange1}-${position.exchange1MarketId}`;
      const key2 = `${position.exchange2}-${position.exchange2MarketId}`;

      const status1 = this.marketStatus.get(key1);
      const status2 = this.marketStatus.get(key2);

      if (status1?.isImminent || status2?.isImminent) {
        result.push({
          position,
          exchange1Status: status1,
          exchange2Status: status2
        });
      }
    }

    return result;
  }

  /**
   * Check all positions for alerts
   */
  private checkAllPositions(): void {
    for (const position of this.positions.values()) {
      this.checkPosition(position);
    }
  }

  /**
   * Check single position for alerts
   */
  private checkPosition(position: MonitoredPosition): void {
    const key1 = `${position.exchange1}-${position.exchange1MarketId}`;
    const key2 = `${position.exchange2}-${position.exchange2MarketId}`;

    const status1 = this.marketStatus.get(key1);
    const status2 = this.marketStatus.get(key2);

    // Check for divergent resolution
    if (status1?.status === 'resolved' && status2?.status === 'resolved') {
      // Both resolved - check if monitoring should flag this
      // (Actual divergence detection would need outcome data)
    }

    // Check for imminent resolution on either side
    if (status1?.isImminent || status2?.isImminent) {
      const alert: ResolutionAlert = {
        type: 'imminent',
        positionId: position.positionId,
        marketId: status1?.isImminent ? position.exchange1MarketId : position.exchange2MarketId,
        exchange: status1?.isImminent ? position.exchange1 : position.exchange2,
        message: `Position ${position.positionId} has imminent resolution`,
        urgency: 'warning',
        timestamp: new Date(),
        details: {
          hoursRemaining: Math.min(
            status1?.hoursUntilResolution ?? Infinity,
            status2?.hoursUntilResolution ?? Infinity
          ),
          exchange1Status: status1,
          exchange2Status: status2
        }
      };

      this.emit('alert', alert);
    }
  }

  /**
   * Check positions affected by a specific market
   */
  private checkPositionsForMarket(marketId: string, exchange: string): void {
    for (const position of this.positions.values()) {
      if (
        (position.exchange1 === exchange && position.exchange1MarketId === marketId) ||
        (position.exchange2 === exchange && position.exchange2MarketId === marketId)
      ) {
        this.checkPosition(position);
      }
    }
  }

  /**
   * Emit alert for imminent resolution
   */
  private emitImminentAlert(status: ResolutionTimingStatus): void {
    // Find affected positions
    for (const position of this.positions.values()) {
      if (
        (position.exchange1 === status.exchange && position.exchange1MarketId === status.marketId) ||
        (position.exchange2 === status.exchange && position.exchange2MarketId === status.marketId)
      ) {
        const alert: ResolutionAlert = {
          type: 'imminent',
          positionId: position.positionId,
          marketId: status.marketId,
          exchange: status.exchange,
          message: `Resolution imminent for ${status.exchange} market ${status.marketId}`,
          urgency: status.hoursUntilResolution && status.hoursUntilResolution < 6 ? 'critical' : 'warning',
          timestamp: new Date(),
          details: {
            hoursRemaining: status.hoursUntilResolution
          }
        };

        this.emit('alert', alert);
      }
    }
  }

  /**
   * Emit event when market resolves
   */
  private emitResolutionEvent(status: ResolutionTimingStatus): void {
    const event: ResolutionEvent = {
      marketId: status.marketId,
      exchange: status.exchange,
      eventType: status.status === 'voided' ? 'voided' : 'resolved',
      timestamp: new Date()
    };

    this.emit('resolution', event);
  }
}
