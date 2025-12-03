import { Pool, PoolClient } from 'pg';
import { CrossExchangeArbitrageOpportunity } from '@arb/core';

export interface OpportunityRecord {
  id: string;
  externalId: string;
  exchangePair: string;
  market1Id: string;
  market2Id: string;
  market1Title: string;
  market2Title: string;
  profitPercent: number;
  profitDollars: number;
  totalCost: number;
  maxSize: number;
  confidence: number;
  status: 'detected' | 'approved' | 'rejected' | 'expired' | 'executed';
  detectedAt: Date;
  expiresAt: Date;
}

export interface ExecutionRecord {
  id: string;
  opportunityId: string;
  status: 'pending' | 'preparing' | 'committing' | 'completed' | 'failed' | 'rolled_back';
  requestedSize: number;
  actualSize?: number;
  exchange1OrderId?: string;
  exchange2OrderId?: string;
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface PositionRecord {
  id: string;
  executionId: string;
  exchange1: string;
  exchange2: string;
  exchange1MarketId: string;
  exchange2MarketId: string;
  exchange1EntryPrice: number;
  exchange2EntryPrice: number;
  positionSize: number;
  totalCost: number;
  expectedPayout: number;
  expectedProfit: number;
  status: 'open' | 'resolving' | 'resolved' | 'disputed';
  openedAt: Date;
  resolvedAt?: Date;
}

export interface CapitalStatus {
  totalCapital: number;
  availableCapital: number;
  allocatedCapital: number;
  reservedCapital: number;
  totalPositions: number;
  totalProfit: number;
  totalTrades: number;
}

/**
 * Position Tracker
 *
 * Manages the lifecycle of arbitrage positions from detection to resolution.
 * Provides real-time capital allocation tracking and audit trail.
 */
export class PositionTracker {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  /**
   * Record detected opportunity
   */
  async trackOpportunity(opportunity: CrossExchangeArbitrageOpportunity): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO opportunities (
          external_id, exchange_pair, market1_id, market2_id,
          market1_title, market2_title, profit_percent, profit_dollars,
          total_cost, max_size, confidence, expires_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id`,
        [
          opportunity.id,
          `${opportunity.marketPair.exchange1}-${opportunity.marketPair.exchange2}`,
          opportunity.marketPair.market1Id,
          opportunity.marketPair.market2Id,
          opportunity.marketPair.market1.title,
          opportunity.marketPair.market2.title,
          opportunity.profitPercent,
          opportunity.profitDollars,
          opportunity.totalCost,
          opportunity.maxSize,
          opportunity.confidence,
          new Date(Date.now() + opportunity.ttl * 1000),
          'detected'
        ]
      );

      const opportunityId = result.rows[0].id;

      await this.logAudit(client, 'opportunity_detected', 'opportunity', opportunityId, {
        exchangePair: `${opportunity.marketPair.exchange1}-${opportunity.marketPair.exchange2}`,
        profitPercent: opportunity.profitPercent,
        confidence: opportunity.confidence
      });

      return opportunityId;
    } finally {
      client.release();
    }
  }

  /**
   * Update opportunity status (approved/rejected)
   */
  async updateOpportunityStatus(
    externalId: string,
    status: 'approved' | 'rejected',
    reviewedBy: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE opportunities
         SET status = $1, reviewed_by = $2, reviewed_at = NOW()
         WHERE external_id = $3`,
        [status, reviewedBy, externalId]
      );

      const result = await client.query(
        `SELECT id FROM opportunities WHERE external_id = $1`,
        [externalId]
      );

      if (result.rows.length > 0) {
        await this.logAudit(client, `opportunity_${status}`, 'opportunity', result.rows[0].id, {
          reviewedBy
        });
      }
    } finally {
      client.release();
    }
  }

  /**
   * Record execution start
   */
  async recordExecution(opportunityId: string, requestedSize: number): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO executions (opportunity_id, requested_size, status)
         VALUES ($1, $2, 'pending')
         RETURNING id`,
        [opportunityId, requestedSize]
      );

      const executionId = result.rows[0].id;

      await client.query(
        `UPDATE opportunities SET status = 'executed' WHERE id = $1`,
        [opportunityId]
      );

      await this.logAudit(client, 'execution_started', 'execution', executionId, {
        opportunityId,
        requestedSize
      });

      await client.query('COMMIT');
      return executionId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update execution status with order IDs
   */
  async updateExecution(
    executionId: string,
    status: ExecutionRecord['status'],
    data: {
      exchange1OrderId?: string;
      exchange2OrderId?: string;
      actualSize?: number;
      errorMessage?: string;
      rollbackReason?: string;
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const updates: string[] = ['status = $1'];
      const values: any[] = [status];
      let paramIndex = 2;

      if (data.exchange1OrderId) {
        updates.push(`exchange1_order_id = $${paramIndex++}`);
        values.push(data.exchange1OrderId);
      }

      if (data.exchange2OrderId) {
        updates.push(`exchange2_order_id = $${paramIndex++}`);
        values.push(data.exchange2OrderId);
      }

      if (data.actualSize) {
        updates.push(`actual_size = $${paramIndex++}`);
        values.push(data.actualSize);
      }

      if (data.errorMessage) {
        updates.push(`error_message = $${paramIndex++}`, `failed_at = NOW()`);
        values.push(data.errorMessage);
      }

      if (data.rollbackReason) {
        updates.push(`rollback_reason = $${paramIndex++}`);
        values.push(data.rollbackReason);
      }

      if (status === 'completed') {
        updates.push('completed_at = NOW()');
      }

      values.push(executionId);

      await client.query(
        `UPDATE executions SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );

      await this.logAudit(client, `execution_${status}`, 'execution', executionId, data);
    } finally {
      client.release();
    }
  }

  /**
   * Open position after successful execution
   */
  async openPosition(
    executionId: string,
    details: {
      exchange1: string;
      exchange2: string;
      exchange1MarketId: string;
      exchange2MarketId: string;
      exchange1EntryPrice: number;
      exchange2EntryPrice: number;
      positionSize: number;
      totalCost: number;
      expectedPayout: number;
    }
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const expectedProfit = details.expectedPayout - details.totalCost;

      const result = await client.query(
        `INSERT INTO positions (
          execution_id, exchange1, exchange2, exchange1_market_id, exchange2_market_id,
          exchange1_entry_price, exchange2_entry_price, position_size, total_cost,
          expected_payout, expected_profit, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')
        RETURNING id`,
        [
          executionId,
          details.exchange1,
          details.exchange2,
          details.exchange1MarketId,
          details.exchange2MarketId,
          details.exchange1EntryPrice,
          details.exchange2EntryPrice,
          details.positionSize,
          details.totalCost,
          details.expectedPayout,
          expectedProfit
        ]
      );

      const positionId = result.rows[0].id;

      // Update capital allocation
      await client.query(
        `UPDATE capital_status
         SET allocated_capital = allocated_capital + $1,
             available_capital = available_capital - $1,
             total_positions = total_positions + 1
         WHERE id = 1`,
        [details.totalCost]
      );

      await this.logAudit(client, 'position_opened', 'position', positionId, {
        executionId,
        positionSize: details.positionSize,
        totalCost: details.totalCost,
        expectedProfit
      });

      await client.query('COMMIT');
      return positionId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close position after resolution
   */
  async closePosition(
    positionId: string,
    resolution: {
      exchange1Resolution: 'YES' | 'NO';
      exchange2Resolution: 'YES' | 'NO';
      exchange1Payout: number;
      exchange2Payout: number;
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const actualProfit = resolution.exchange1Payout + resolution.exchange2Payout;
      const divergent = resolution.exchange1Resolution !== resolution.exchange2Resolution;

      const position = await client.query(
        `SELECT total_cost FROM positions WHERE id = $1`,
        [positionId]
      );
      const totalCost = position.rows[0].total_cost;

      await client.query(
        `UPDATE positions
         SET status = 'resolved',
             exchange1_resolution = $1,
             exchange2_resolution = $2,
             exchange1_payout = $3,
             exchange2_payout = $4,
             actual_profit = $5,
             divergent_resolution = $6,
             resolved_at = NOW()
         WHERE id = $7`,
        [
          resolution.exchange1Resolution,
          resolution.exchange2Resolution,
          resolution.exchange1Payout,
          resolution.exchange2Payout,
          actualProfit - totalCost,
          divergent,
          positionId
        ]
      );

      // Update capital and stats
      await client.query(
        `UPDATE capital_status
         SET allocated_capital = allocated_capital - $1,
             available_capital = available_capital + $2,
             total_positions = total_positions - 1,
             total_profit = total_profit + $3,
             total_trades = total_trades + 1
         WHERE id = 1`,
        [totalCost, actualProfit, actualProfit - totalCost]
      );

      // Update daily stats
      await client.query(
        `INSERT INTO daily_trades (trade_date, trades_count, profit_realized, positions_closed)
         VALUES (CURRENT_DATE, 1, $1, 1)
         ON CONFLICT (trade_date) DO UPDATE
         SET trades_count = daily_trades.trades_count + 1,
             profit_realized = daily_trades.profit_realized + $1,
             positions_closed = daily_trades.positions_closed + 1`,
        [actualProfit - totalCost]
      );

      await this.logAudit(client, 'position_closed', 'position', positionId, {
        actualProfit: actualProfit - totalCost,
        divergent
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get current capital status
   */
  async getCapitalStatus(): Promise<CapitalStatus> {
    const result = await this.pool.query(`SELECT * FROM capital_status WHERE id = 1`);
    const row = result.rows[0];

    return {
      totalCapital: parseFloat(row.total_capital),
      availableCapital: parseFloat(row.available_capital),
      allocatedCapital: parseFloat(row.allocated_capital),
      reservedCapital: parseFloat(row.reserved_capital),
      totalPositions: row.total_positions,
      totalProfit: parseFloat(row.total_profit),
      totalTrades: row.total_trades
    };
  }

  /**
   * Get open positions
   */
  async getOpenPositions(): Promise<PositionRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM positions WHERE status = 'open' ORDER BY opened_at DESC`
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      executionId: row.execution_id,
      exchange1: row.exchange1,
      exchange2: row.exchange2,
      exchange1MarketId: row.exchange1_market_id,
      exchange2MarketId: row.exchange2_market_id,
      exchange1EntryPrice: parseFloat(row.exchange1_entry_price),
      exchange2EntryPrice: parseFloat(row.exchange2_entry_price),
      positionSize: parseFloat(row.position_size),
      totalCost: parseFloat(row.total_cost),
      expectedPayout: parseFloat(row.expected_payout),
      expectedProfit: parseFloat(row.expected_profit),
      status: row.status,
      openedAt: row.opened_at,
      resolvedAt: row.resolved_at
    }));
  }

  /**
   * Log audit trail
   */
  private async logAudit(
    client: PoolClient,
    action: string,
    entityType: string,
    entityId: string,
    details: any
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, 'system', $4)`,
      [action, entityType, entityId, JSON.stringify(details)]
    );
  }

  /**
   * Close database connections
   */
  async disconnect(): Promise<void> {
    await this.pool.end();
  }
}
