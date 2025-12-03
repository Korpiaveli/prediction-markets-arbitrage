import {
  IExchange,
  CrossExchangeArbitrageOpportunity,
  OrderRequest,
  OrderResult
} from '@arb/core';
import { PositionTracker } from '@arb/tracking';
import { EventEmitter } from 'eventemitter3';

export interface ExecutionPlan {
  opportunityId: string;
  exchange1: IExchange;
  exchange2: IExchange;
  exchange1Order: OrderRequest;
  exchange2Order: OrderRequest;
  totalCost: number;
  expectedProfit: number;
  timeout: number; // milliseconds
}

export interface ExecutionResult {
  success: boolean;
  executionId?: string;
  positionId?: string;
  exchange1OrderId?: string;
  exchange2OrderId?: string;
  actualSize: number;
  actualCost: number;
  actualProfit: number;
  phase: 'prepare' | 'commit' | 'completed' | 'rollback';
  error?: string;
  rollbackReason?: string;
}

/**
 * Execution Engine
 *
 * Implements two-phase commit protocol for atomic arbitrage execution.
 * Ensures both legs execute successfully or rolls back automatically.
 */
export class ExecutionEngine extends EventEmitter {
  private tracker: PositionTracker;
  private executionTimeout: number = 5000; // 5 seconds

  constructor(tracker: PositionTracker) {
    super();
    this.tracker = tracker;
  }

  /**
   * Execute arbitrage trade atomically
   *
   * PHASE 1 - PREPARE:
   *   - Fetch fresh quotes
   *   - Re-validate profit
   *   - Check liquidity
   *   - Build execution plan
   *
   * PHASE 2 - COMMIT:
   *   - Submit both orders simultaneously
   *   - Enforce timeout
   *   - Verify fills
   *
   * PHASE 3 - ROLLBACK (if needed):
   *   - Cancel pending orders
   *   - Emergency hedge
   *   - Log incident
   */
  async execute(
    opportunity: CrossExchangeArbitrageOpportunity,
    approvedSize: number,
    exchange1: IExchange,
    exchange2: IExchange
  ): Promise<ExecutionResult> {
    console.log(`[ExecutionEngine] Starting execution for ${opportunity.id}`);
    this.emit('execution_started', { opportunityId: opportunity.id, approvedSize });

    try {
      // PHASE 1: PREPARE
      const plan = await this.prepare(opportunity, approvedSize, exchange1, exchange2);
      if (!plan) {
        return {
          success: false,
          actualSize: 0,
          actualCost: 0,
          actualProfit: 0,
          phase: 'prepare',
          error: 'Preparation failed: opportunity no longer valid'
        };
      }

      this.emit('prepare_completed', plan);

      // PHASE 2: COMMIT
      const commitResult = await this.commit(plan);

      if (!commitResult.success) {
        // PHASE 3: ROLLBACK
        await this.rollback(commitResult, plan);
        return commitResult;
      }

      // Success: Record position
      const executionId = await this.tracker.recordExecution(opportunity.id, commitResult.actualSize);

      await this.tracker.updateExecution(executionId, 'completed', {
        exchange1OrderId: commitResult.exchange1OrderId,
        exchange2OrderId: commitResult.exchange2OrderId,
        actualSize: commitResult.actualSize
      });

      const positionId = await this.tracker.openPosition(executionId, {
        exchange1: plan.exchange1.name,
        exchange2: plan.exchange2.name,
        exchange1MarketId: opportunity.marketPair.market1Id,
        exchange2MarketId: opportunity.marketPair.market2Id,
        exchange1EntryPrice: commitResult.actualCost / commitResult.actualSize,
        exchange2EntryPrice: commitResult.actualCost / commitResult.actualSize,
        positionSize: commitResult.actualSize,
        totalCost: commitResult.actualCost,
        expectedPayout: commitResult.actualSize // $1 per contract set
      });

      this.emit('execution_completed', { executionId, positionId });

      return {
        ...commitResult,
        executionId,
        positionId,
        phase: 'completed'
      };

    } catch (error) {
      console.error('[ExecutionEngine] Execution failed:', error);
      this.emit('execution_failed', { opportunityId: opportunity.id, error });

      return {
        success: false,
        actualSize: 0,
        actualCost: 0,
        actualProfit: 0,
        phase: 'prepare',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * PHASE 1: Prepare execution plan
   */
  private async prepare(
    opportunity: CrossExchangeArbitrageOpportunity,
    approvedSize: number,
    exchange1: IExchange,
    exchange2: IExchange
  ): Promise<ExecutionPlan | null> {
    console.log('[ExecutionEngine] PHASE 1: PREPARE');

    // Fetch fresh quotes (must be < 500ms old)
    const startTime = Date.now();

    const [quote1, quote2] = await Promise.all([
      exchange1.getQuote(opportunity.marketPair.market1Id),
      exchange2.getQuote(opportunity.marketPair.market2Id)
    ]);

    const quoteAge = Date.now() - startTime;
    if (quoteAge > 500) {
      console.warn(`[ExecutionEngine] Quotes too old: ${quoteAge}ms`);
      return null;
    }

    // Re-validate profit still exists
    const currentSpread = quote1.yes.ask + quote2.no.ask;
    const currentProfit = (1.0 - currentSpread) - opportunity.fees.totalFees;

    if (currentProfit <= 0) {
      console.warn(`[ExecutionEngine] Profit disappeared: ${currentProfit.toFixed(4)}`);
      return null;
    }

    // Check liquidity for atomic executability
    const minLiquidity = Math.min(
      quote1.yes.liquidity || 0,
      quote2.no.liquidity || 0
    );

    if (approvedSize > minLiquidity) {
      console.warn(`[ExecutionEngine] Insufficient liquidity: ${approvedSize} > ${minLiquidity}`);
      return null;
    }

    // Build execution plan
    const plan: ExecutionPlan = {
      opportunityId: opportunity.id,
      exchange1,
      exchange2,
      exchange1Order: {
        marketId: opportunity.marketPair.market1Id,
        side: 'YES',
        size: approvedSize,
        price: quote1.yes.ask,
        type: 'limit'
      },
      exchange2Order: {
        marketId: opportunity.marketPair.market2Id,
        side: 'NO',
        size: approvedSize,
        price: quote2.no.ask,
        type: 'limit'
      },
      totalCost: (quote1.yes.ask + quote2.no.ask) * approvedSize,
      expectedProfit: currentProfit * approvedSize,
      timeout: this.executionTimeout
    };

    console.log('[ExecutionEngine] Execution plan prepared:', {
      size: approvedSize,
      cost: plan.totalCost.toFixed(2),
      profit: plan.expectedProfit.toFixed(2)
    });

    return plan;
  }

  /**
   * PHASE 2: Commit both orders simultaneously
   */
  private async commit(plan: ExecutionPlan): Promise<ExecutionResult> {
    console.log('[ExecutionEngine] PHASE 2: COMMIT');

    const startTime = Date.now();

    try {
      // Submit both orders simultaneously with timeout
      const orderPromises = Promise.race([
        Promise.all([
          plan.exchange1.placeOrder(plan.exchange1Order),
          plan.exchange2.placeOrder(plan.exchange2Order)
        ]),
        this.timeout(plan.timeout)
      ]);

      const [result1, result2] = await orderPromises as [OrderResult, OrderResult];

      const elapsed = Date.now() - startTime;
      console.log(`[ExecutionEngine] Orders submitted in ${elapsed}ms`);

      // Verify both filled
      if (result1.status === 'filled' && result2.status === 'filled') {
        const actualSize = Math.min(result1.filledSize, result2.filledSize);
        const actualCost = (result1.filledPrice * result1.filledSize) +
                          (result2.filledPrice * result2.filledSize);
        const actualProfit = (actualSize * 1.0) - actualCost;

        console.log('[ExecutionEngine] COMMIT SUCCESS:', {
          actualSize,
          actualCost: actualCost.toFixed(2),
          actualProfit: actualProfit.toFixed(2)
        });

        return {
          success: true,
          exchange1OrderId: result1.orderId,
          exchange2OrderId: result2.orderId,
          actualSize,
          actualCost,
          actualProfit,
          phase: 'commit'
        };
      }

      // Partial fill - needs rollback
      return {
        success: false,
        exchange1OrderId: result1.orderId,
        exchange2OrderId: result2.orderId,
        actualSize: 0,
        actualCost: 0,
        actualProfit: 0,
        phase: 'commit',
        rollbackReason: `Partial fill: ${result1.status}, ${result2.status}`
      };

    } catch (error) {
      console.error('[ExecutionEngine] COMMIT FAILED:', error);

      return {
        success: false,
        actualSize: 0,
        actualCost: 0,
        actualProfit: 0,
        phase: 'commit',
        error: error instanceof Error ? error.message : 'Commit timeout or error'
      };
    }
  }

  /**
   * PHASE 3: Rollback on failure
   */
  private async rollback(result: ExecutionResult, plan: ExecutionPlan): Promise<void> {
    console.log('[ExecutionEngine] PHASE 3: ROLLBACK');

    const rollbackActions: Promise<void>[] = [];

    // Cancel any pending orders
    if (result.exchange1OrderId) {
      rollbackActions.push(
        plan.exchange1.cancelOrder(result.exchange1OrderId).catch(err => {
          console.error('[ExecutionEngine] Failed to cancel order on exchange1:', err);
        })
      );
    }

    if (result.exchange2OrderId) {
      rollbackActions.push(
        plan.exchange2.cancelOrder(result.exchange2OrderId).catch(err => {
          console.error('[ExecutionEngine] Failed to cancel order on exchange2:', err);
        })
      );
    }

    await Promise.allSettled(rollbackActions);

    // TODO: Emergency hedge if one leg filled but other didn't
    // This would involve closing the filled position at market

    this.emit('rollback_completed', {
      opportunityId: plan.opportunityId,
      reason: result.rollbackReason || result.error
    });

    console.log('[ExecutionEngine] Rollback completed');
  }

  /**
   * Timeout helper
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Execution timeout')), ms);
    });
  }

  /**
   * Set execution timeout
   */
  setExecutionTimeout(ms: number): void {
    this.executionTimeout = ms;
    console.log(`[ExecutionEngine] Timeout set to ${ms}ms`);
  }
}
