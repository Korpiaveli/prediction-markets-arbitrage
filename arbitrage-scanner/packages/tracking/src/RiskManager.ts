import { CrossExchangeArbitrageOpportunity } from '@arb/core';
import { PositionTracker, CapitalStatus } from './PositionTracker.js';

export interface RiskLimits {
  maxPositionSize: number;        // Max $ per position (default: $1,000)
  minPositionSize: number;        // Min $ per position (default: $200)
  maxDailyDeployment: number;     // Max $ deployed per day (default: $5,000)
  maxOpenPositions: number;       // Max concurrent positions (default: 20)
  maxSameMarketPositions: number; // Max positions on same market (default: 3)
  minProfitPercent: number;       // Min profit % after fees (default: 2%)
  maxSlippageTolerance: number;   // Max acceptable slippage % (default: 4%)
}

export interface RiskValidationResult {
  approved: boolean;
  adjustedSize?: number;
  reasons: string[];
  warnings: string[];
  blockers: string[];
}

export interface DailyDeployment {
  date: Date;
  totalDeployed: number;
  tradesCount: number;
  remainingCapacity: number;
}

/**
 * Risk Manager
 *
 * Enforces position limits, capital allocation rules, and pre-trade validation.
 * Prevents over-exposure and ensures capital preservation.
 */
export class RiskManager {
  private limits: RiskLimits;
  private tracker: PositionTracker;
  private blockedExchanges: Set<string> = new Set();

  constructor(tracker: PositionTracker, limits?: Partial<RiskLimits>) {
    this.tracker = tracker;
    this.limits = {
      maxPositionSize: 1000,
      minPositionSize: 200,
      maxDailyDeployment: 5000,
      maxOpenPositions: 20,
      maxSameMarketPositions: 3,
      minProfitPercent: 2.0,
      maxSlippageTolerance: 4.0,
      ...limits
    };
  }

  /**
   * Validate trade before execution
   * Returns approval status and optionally adjusted position size
   */
  async validateTrade(
    opportunity: CrossExchangeArbitrageOpportunity,
    requestedSize: number
  ): Promise<RiskValidationResult> {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const blockers: string[] = [];
    let adjustedSize = requestedSize;
    let approved = true;

    // Check profit threshold
    if (opportunity.profitPercent < this.limits.minProfitPercent) {
      blockers.push(`Profit ${opportunity.profitPercent.toFixed(2)}% below minimum ${this.limits.minProfitPercent}%`);
      approved = false;
    } else {
      reasons.push(`Profit ${opportunity.profitPercent.toFixed(2)}% meets minimum threshold`);
    }

    // Check position size limits
    if (requestedSize < this.limits.minPositionSize) {
      blockers.push(`Size $${requestedSize} below minimum $${this.limits.minPositionSize}`);
      approved = false;
    } else if (requestedSize > this.limits.maxPositionSize) {
      adjustedSize = this.limits.maxPositionSize;
      warnings.push(`Size reduced from $${requestedSize} to $${this.limits.maxPositionSize} (max limit)`);
    }

    // Check blocked exchanges
    const exchange1 = opportunity.marketPair.exchange1;
    const exchange2 = opportunity.marketPair.exchange2;

    if (this.blockedExchanges.has(exchange1)) {
      blockers.push(`Exchange ${exchange1} is currently blocked`);
      approved = false;
    }

    if (this.blockedExchanges.has(exchange2)) {
      blockers.push(`Exchange ${exchange2} is currently blocked`);
      approved = false;
    }

    // Check capital availability
    const capitalStatus = await this.tracker.getCapitalStatus();
    if (capitalStatus.availableCapital < adjustedSize) {
      if (capitalStatus.availableCapital >= this.limits.minPositionSize) {
        adjustedSize = Math.floor(capitalStatus.availableCapital);
        warnings.push(`Size reduced to $${adjustedSize} (available capital limit)`);
      } else {
        blockers.push(`Insufficient capital: $${capitalStatus.availableCapital} available`);
        approved = false;
      }
    }

    // Check open positions limit
    if (capitalStatus.totalPositions >= this.limits.maxOpenPositions) {
      blockers.push(`Maximum open positions reached (${this.limits.maxOpenPositions})`);
      approved = false;
    } else if (capitalStatus.totalPositions >= this.limits.maxOpenPositions * 0.8) {
      warnings.push(`Approaching max positions (${capitalStatus.totalPositions}/${this.limits.maxOpenPositions})`);
    }

    // Check daily deployment limit
    const dailyDeployment = await this.getDailyDeployment();
    if (dailyDeployment.totalDeployed + adjustedSize > this.limits.maxDailyDeployment) {
      const remaining = this.limits.maxDailyDeployment - dailyDeployment.totalDeployed;
      if (remaining >= this.limits.minPositionSize) {
        adjustedSize = Math.floor(remaining);
        warnings.push(`Size reduced to $${adjustedSize} (daily deployment limit)`);
      } else {
        blockers.push(`Daily deployment limit reached: $${dailyDeployment.totalDeployed}/$${this.limits.maxDailyDeployment}`);
        approved = false;
      }
    }

    // Check liquidity and slippage
    if (opportunity.liquidity) {
      const exchange1Available = opportunity.liquidity.exchange1Available;
      const exchange2Available = opportunity.liquidity.exchange2Available;
      const minAvailable = Math.min(exchange1Available, exchange2Available);

      if (adjustedSize > minAvailable * 0.3) {
        warnings.push(`Position is ${((adjustedSize / minAvailable) * 100).toFixed(1)}% of available liquidity`);
      }

      // Estimate slippage based on order book depth
      const estimatedSlippage = this.estimateSlippage(adjustedSize, minAvailable);
      if (estimatedSlippage > this.limits.maxSlippageTolerance) {
        blockers.push(`Estimated slippage ${estimatedSlippage.toFixed(2)}% exceeds tolerance ${this.limits.maxSlippageTolerance}%`);
        approved = false;
      } else if (estimatedSlippage > this.limits.maxSlippageTolerance * 0.7) {
        warnings.push(`High estimated slippage: ${estimatedSlippage.toFixed(2)}%`);
      }
    }

    // Check resolution alignment
    if (opportunity.resolutionAlignment && !opportunity.resolutionAlignment.tradeable) {
      blockers.push(`Resolution risk detected: ${opportunity.resolutionAlignment.risks.join(', ')}`);
      approved = false;
    } else if (opportunity.resolutionAlignment && opportunity.resolutionAlignment.warnings.length > 0) {
      warnings.push(...opportunity.resolutionAlignment.warnings);
    }

    return {
      approved,
      adjustedSize: adjustedSize !== requestedSize ? adjustedSize : undefined,
      reasons,
      warnings,
      blockers
    };
  }

  /**
   * Adjust position size based on risk limits
   */
  async adjustPositionSize(
    requestedSize: number,
    capitalStatus: CapitalStatus,
    dailyDeployment: DailyDeployment
  ): Promise<number> {
    let size = requestedSize;

    // Apply position size limits
    size = Math.min(size, this.limits.maxPositionSize);
    size = Math.max(size, this.limits.minPositionSize);

    // Apply available capital limit
    size = Math.min(size, capitalStatus.availableCapital);

    // Apply daily deployment limit
    const dailyRemaining = this.limits.maxDailyDeployment - dailyDeployment.totalDeployed;
    size = Math.min(size, dailyRemaining);

    // Round to nearest dollar
    return Math.floor(size);
  }

  /**
   * Enforce risk limits (called periodically)
   */
  async enforceRiskLimits(): Promise<{ violations: string[]; actions: string[] }> {
    const violations: string[] = [];
    const actions: string[] = [];

    const capitalStatus = await this.tracker.getCapitalStatus();
    const openPositions = await this.tracker.getOpenPositions();

    // Check for over-allocation
    if (capitalStatus.allocatedCapital > capitalStatus.totalCapital) {
      violations.push(`Capital over-allocated: $${capitalStatus.allocatedCapital} > $${capitalStatus.totalCapital}`);
      actions.push('CRITICAL: Review all open positions immediately');
    }

    // Check for excessive open positions
    if (capitalStatus.totalPositions > this.limits.maxOpenPositions) {
      violations.push(`Excessive open positions: ${capitalStatus.totalPositions} > ${this.limits.maxOpenPositions}`);
      actions.push('Block new positions until count decreases');
    }

    // Check daily deployment
    const dailyDeployment = await this.getDailyDeployment();
    if (dailyDeployment.totalDeployed > this.limits.maxDailyDeployment) {
      violations.push(`Daily deployment exceeded: $${dailyDeployment.totalDeployed} > $${this.limits.maxDailyDeployment}`);
      actions.push('Block new positions for remainder of day');
    }

    // Check for stale positions (open > 30 days)
    const stalePositions = openPositions.filter(p => {
      const age = Date.now() - p.openedAt.getTime();
      return age > 30 * 24 * 60 * 60 * 1000; // 30 days
    });

    if (stalePositions.length > 0) {
      violations.push(`${stalePositions.length} positions open > 30 days`);
      actions.push('Review stale positions for manual resolution');
    }

    return { violations, actions };
  }

  /**
   * Block an exchange (emergency halt)
   */
  blockExchange(exchangeName: string, reason: string): void {
    this.blockedExchanges.add(exchangeName);
    console.warn(`[RiskManager] Exchange ${exchangeName} blocked: ${reason}`);
  }

  /**
   * Unblock an exchange
   */
  unblockExchange(exchangeName: string): void {
    this.blockedExchanges.delete(exchangeName);
    console.log(`[RiskManager] Exchange ${exchangeName} unblocked`);
  }

  /**
   * Get current risk limits
   */
  getRiskLimits(): RiskLimits {
    return { ...this.limits };
  }

  /**
   * Update risk limits
   */
  updateRiskLimits(limits: Partial<RiskLimits>): void {
    this.limits = { ...this.limits, ...limits };
    console.log('[RiskManager] Risk limits updated:', this.limits);
  }

  /**
   * Get daily deployment statistics
   */
  private async getDailyDeployment(): Promise<DailyDeployment> {
    // TODO: Query database for today's deployment
    // For now, return mock data
    return {
      date: new Date(),
      totalDeployed: 0,
      tradesCount: 0,
      remainingCapacity: this.limits.maxDailyDeployment
    };
  }

  /**
   * Estimate slippage based on position size vs liquidity
   * Non-linear model: slippage increases exponentially with order size
   */
  private estimateSlippage(orderSize: number, availableLiquidity: number): number {
    if (availableLiquidity === 0) return 100; // No liquidity = 100% slippage

    const ratio = orderSize / availableLiquidity;

    // Non-linear slippage model:
    // Small orders (<10% of liquidity): minimal slippage
    // Medium orders (10-30%): moderate slippage
    // Large orders (>30%): high slippage
    const baseSlippage = 0.5; // 0.5% base
    const spreadImpact = 1.0; // 1% spread cost
    const nonLinearFactor = 0.15; // Calibrated for prediction markets

    const slippage = baseSlippage + spreadImpact + (nonLinearFactor * Math.pow(ratio, 2) * 100);

    return slippage;
  }
}
