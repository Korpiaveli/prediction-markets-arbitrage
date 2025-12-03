import { IExchange } from '@arb/core';
import { PositionTracker } from '@arb/tracking';
import { EventEmitter } from 'eventemitter3';

export interface PositionDiscrepancy {
  positionId: string;
  type: 'missing_leg' | 'size_mismatch' | 'resolution_divergence' | 'premature_resolution';
  severity: 'critical' | 'high' | 'medium';
  details: string;
  timestamp: Date;
}

export interface PositionPnL {
  positionId: string;
  unrealizedPnL: number;
  realizedPnL: number;
  totalCost: number;
  currentValue: number;
  expectedPayout: number;
  timestamp: Date;
}

/**
 * Position Monitor
 *
 * Monitors open positions for discrepancies and calculates real-time P&L.
 * Runs on 60-second polling interval to detect issues early.
 */
export class PositionMonitor extends EventEmitter {
  private tracker: PositionTracker;
  private exchanges: Map<string, IExchange>;
  private pollingInterval: number = 60000; // 60 seconds
  private intervalId?: NodeJS.Timeout;
  private running: boolean = false;

  constructor(tracker: PositionTracker, exchanges: IExchange[]) {
    super();
    this.tracker = tracker;
    this.exchanges = new Map(exchanges.map(e => [e.name, e]));
  }

  /**
   * Start monitoring positions
   */
  start(): void {
    if (this.running) {
      console.log('[PositionMonitor] Already running');
      return;
    }

    console.log('[PositionMonitor] Starting monitoring (60s interval)');
    this.running = true;

    // Initial check
    this.monitorPositions();

    // Start polling
    this.intervalId = setInterval(() => {
      this.monitorPositions();
    }, this.pollingInterval);

    this.emit('monitor_started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    console.log('[PositionMonitor] Stopping monitoring');
    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.emit('monitor_stopped');
  }

  /**
   * Monitor all open positions
   */
  private async monitorPositions(): Promise<void> {
    try {
      const positions = await this.tracker.getOpenPositions();

      console.log(`[PositionMonitor] Checking ${positions.length} open positions`);

      for (const position of positions) {
        await this.checkPosition(position);
      }
    } catch (error) {
      console.error('[PositionMonitor] Failed to monitor positions:', error);
      this.emit('monitor_error', error);
    }
  }

  /**
   * Check individual position for discrepancies
   */
  private async checkPosition(position: any): Promise<void> {
    try {
      const exchange1 = this.exchanges.get(position.exchange1);
      const exchange2 = this.exchanges.get(position.exchange2);

      if (!exchange1 || !exchange2) {
        console.error(`[PositionMonitor] Exchange not found for position ${position.id}`);
        return;
      }

      // Check for missing legs
      await this.checkMissingLegs(position, exchange1, exchange2);

      // Check for size mismatches
      await this.checkSizeMismatch(position, exchange1, exchange2);

      // Check for resolution divergence
      await this.checkResolutionDivergence(position, exchange1, exchange2);

      // Calculate P&L
      await this.calculatePnL(position, exchange1, exchange2);
    } catch (error) {
      console.error(`[PositionMonitor] Failed to check position ${position.id}:`, error);
    }
  }

  /**
   * Check if both legs of the position exist
   */
  private async checkMissingLegs(
    position: any,
    exchange1: IExchange,
    exchange2: IExchange
  ): Promise<void> {
    try {
      const [market1, market2] = await Promise.all([
        exchange1.getMarket(position.exchange1MarketId),
        exchange2.getMarket(position.exchange2MarketId)
      ]);

      if (!market1) {
        this.reportDiscrepancy({
          positionId: position.id,
          type: 'missing_leg',
          severity: 'critical',
          details: `Market missing on ${exchange1.name}: ${position.exchange1MarketId}`,
          timestamp: new Date()
        });
      }

      if (!market2) {
        this.reportDiscrepancy({
          positionId: position.id,
          type: 'missing_leg',
          severity: 'critical',
          details: `Market missing on ${exchange2.name}: ${position.exchange2MarketId}`,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error(`[PositionMonitor] Failed to check missing legs for position ${position.id}:`, error);
    }
  }

  /**
   * Check for size mismatches between exchanges
   */
  private async checkSizeMismatch(
    position: any,
    exchange1: IExchange,
    exchange2: IExchange
  ): Promise<void> {
    try {
      // In real implementation, would fetch actual position sizes from exchanges
      // For now, we just check if the recorded sizes match
      const expectedSize = position.positionSize;

      // This is a placeholder - real implementation would fetch from exchange APIs
      const actualSize1 = expectedSize; // Fetch from exchange1
      const actualSize2 = expectedSize; // Fetch from exchange2

      const tolerance = 0.01; // 1% tolerance

      if (Math.abs(actualSize1 - expectedSize) > tolerance * expectedSize) {
        this.reportDiscrepancy({
          positionId: position.id,
          type: 'size_mismatch',
          severity: 'high',
          details: `Size mismatch on ${exchange1.name}: expected ${expectedSize}, got ${actualSize1}`,
          timestamp: new Date()
        });
      }

      if (Math.abs(actualSize2 - expectedSize) > tolerance * expectedSize) {
        this.reportDiscrepancy({
          positionId: position.id,
          type: 'size_mismatch',
          severity: 'high',
          details: `Size mismatch on ${exchange2.name}: expected ${expectedSize}, got ${actualSize2}`,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error(`[PositionMonitor] Failed to check size mismatch for position ${position.id}:`, error);
    }
  }

  /**
   * Check for resolution divergence (markets resolving to different outcomes)
   */
  private async checkResolutionDivergence(
    position: any,
    exchange1: IExchange,
    exchange2: IExchange
  ): Promise<void> {
    try {
      const [market1, market2] = await Promise.all([
        exchange1.getMarket(position.exchange1MarketId),
        exchange2.getMarket(position.exchange2MarketId)
      ]);

      if (!market1 || !market2) {
        return;
      }

      // Check if either market is resolved
      const market1Resolved = market1.metadata?.result !== undefined && market1.metadata?.result !== null;
      const market2Resolved = market2.metadata?.result !== undefined && market2.metadata?.result !== null;

      // If only one resolved, check for premature resolution
      if (market1Resolved && !market2Resolved) {
        this.reportDiscrepancy({
          positionId: position.id,
          type: 'premature_resolution',
          severity: 'medium',
          details: `Market resolved on ${exchange1.name} but not on ${exchange2.name}`,
          timestamp: new Date()
        });
      } else if (market2Resolved && !market1Resolved) {
        this.reportDiscrepancy({
          positionId: position.id,
          type: 'premature_resolution',
          severity: 'medium',
          details: `Market resolved on ${exchange2.name} but not on ${exchange1.name}`,
          timestamp: new Date()
        });
      }

      // If both resolved, check for divergence
      if (market1Resolved && market2Resolved) {
        const result1 = market1.metadata?.result?.toString().toLowerCase();
        const result2 = market2.metadata?.result?.toString().toLowerCase();

        // Simple comparison - in real implementation, would need more sophisticated logic
        // to account for different result formats across exchanges
        if (result1 !== result2) {
          this.reportDiscrepancy({
            positionId: position.id,
            type: 'resolution_divergence',
            severity: 'critical',
            details: `Resolution divergence: ${exchange1.name}=${result1}, ${exchange2.name}=${result2}`,
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      console.error(`[PositionMonitor] Failed to check resolution divergence for position ${position.id}:`, error);
    }
  }

  /**
   * Calculate real-time P&L for position
   */
  private async calculatePnL(
    position: any,
    exchange1: IExchange,
    exchange2: IExchange
  ): Promise<void> {
    try {
      const [quote1, quote2] = await Promise.all([
        exchange1.getQuote(position.exchange1MarketId),
        exchange2.getQuote(position.exchange2MarketId)
      ]);

      const totalCost = position.totalCost;
      const positionSize = position.positionSize;

      // Current value depends on which leg is which
      // Assuming leg1 is YES, leg2 is NO (from original execution)
      const currentValue1 = quote1.yes.bid * positionSize;
      const currentValue2 = quote2.no.bid * positionSize;
      const currentValue = currentValue1 + currentValue2;

      const unrealizedPnL = currentValue - totalCost;
      const expectedPayout = position.expectedPayout || positionSize; // $1 per contract set

      const pnl: PositionPnL = {
        positionId: position.id,
        unrealizedPnL,
        realizedPnL: 0, // Only when closed
        totalCost,
        currentValue,
        expectedPayout,
        timestamp: new Date()
      };

      this.emit('pnl_updated', pnl);

      // Log if P&L is significantly negative
      if (unrealizedPnL < -totalCost * 0.1) {
        console.warn(`[PositionMonitor] Position ${position.id} has significant loss: ${unrealizedPnL.toFixed(2)}`);
      }
    } catch (error) {
      console.error(`[PositionMonitor] Failed to calculate P&L for position ${position.id}:`, error);
    }
  }

  /**
   * Report discrepancy
   */
  private reportDiscrepancy(discrepancy: PositionDiscrepancy): void {
    console.error(
      `[PositionMonitor] ${discrepancy.severity.toUpperCase()} DISCREPANCY: ` +
      `Position ${discrepancy.positionId} - ${discrepancy.type}: ${discrepancy.details}`
    );

    this.emit('discrepancy_detected', discrepancy);

    // Auto-close position if critical discrepancy
    if (discrepancy.severity === 'critical') {
      this.emit('critical_discrepancy', discrepancy);
    }
  }

  /**
   * Set polling interval
   */
  setPollingInterval(ms: number): void {
    this.pollingInterval = ms;

    // Restart if currently running
    if (this.running) {
      this.stop();
      this.start();
    }

    console.log(`[PositionMonitor] Polling interval set to ${ms}ms`);
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      running: this.running,
      pollingInterval: this.pollingInterval,
      exchangeCount: this.exchanges.size
    };
  }
}
