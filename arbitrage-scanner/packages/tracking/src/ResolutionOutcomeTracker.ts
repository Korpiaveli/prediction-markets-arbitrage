import { Pool, PoolClient } from 'pg';
import { ResolutionAlignment } from '@arb/math';

export interface ResolutionPredictionRecord {
  id: string;
  positionId: string;
  opportunityId: string;
  predictedScore: number;
  predictedLevel: string;
  sourcesMatch: boolean;
  timingMatch: boolean;
  conditionsMatch: boolean;
  temporalDistance?: number;
  exchangePair: string;
  market1Id: string;
  market2Id: string;
  risks: string[];
  warnings: string[];
  polymarket5050Risk: boolean;
  predictedAt: Date;
}

export interface ResolutionOutcomeRecord {
  id: string;
  predictionId: string;
  positionId: string;
  resolvedSame: boolean;
  exchange1Outcome: 'YES' | 'NO' | 'VOID';
  exchange2Outcome: 'YES' | 'NO' | 'VOID';
  resolutionReason?: string;
  outcomeNotes?: string;
  actualProfit?: number;
  expectedProfit?: number;
  profitDeviation?: number;
  predictionAccurate: boolean;
  resolvedAt: Date;
}

export interface CalibrationBucket {
  scoreBucket: string;
  totalPredictions: number;
  resolvedSameCount: number;
  accurateCount: number;
  sameResolutionRate: number;
  accuracyRate: number;
  avgPredictedScore: number;
  avgProfitDeviation?: number;
}

export interface CalibrationSummary {
  totalPredictions: number;
  totalResolutions: number;
  overallSameRate: number;
  overallAccuracyRate: number;
  buckets: CalibrationBucket[];
  byExchangePair: Map<string, CalibrationBucket[]>;
}

/**
 * Resolution Outcome Tracker
 *
 * Tracks predicted vs actual resolution outcomes to calibrate
 * the resolution scoring algorithm over time.
 */
export class ResolutionOutcomeTracker {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  /**
   * Record a resolution prediction when a position is opened
   */
  async recordPrediction(
    positionId: string,
    opportunityId: string,
    alignment: ResolutionAlignment,
    exchangePair: string,
    market1Id: string,
    market2Id: string
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO resolution_predictions (
          position_id, opportunity_id, predicted_score, predicted_level,
          sources_match, timing_match, conditions_match, temporal_distance,
          exchange_pair, market1_id, market2_id, risks, warnings, polymarket_5050_risk
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`,
        [
          positionId,
          opportunityId,
          alignment.score,
          alignment.level,
          alignment.sourcesMatch,
          alignment.timingMatch,
          alignment.conditionsMatch,
          alignment.temporalDistance || null,
          exchangePair,
          market1Id,
          market2Id,
          JSON.stringify(alignment.risks),
          JSON.stringify(alignment.warnings),
          alignment.polymarket5050Risk || false
        ]
      );

      // Also update the position with resolution score
      await client.query(
        `UPDATE positions SET resolution_score = $1, resolution_level = $2 WHERE id = $3`,
        [alignment.score, alignment.level, positionId]
      );

      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  /**
   * Record actual resolution outcome when position closes
   */
  async recordOutcome(
    predictionId: string,
    positionId: string,
    outcome: {
      exchange1Outcome: 'YES' | 'NO' | 'VOID';
      exchange2Outcome: 'YES' | 'NO' | 'VOID';
      resolutionReason?: string;
      outcomeNotes?: string;
      actualProfit?: number;
      expectedProfit?: number;
    }
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      // Determine if markets resolved the same way
      const resolvedSame = outcome.exchange1Outcome === outcome.exchange2Outcome &&
                           outcome.exchange1Outcome !== 'VOID';

      // Get the prediction to determine if it was accurate
      const predResult = await client.query(
        `SELECT predicted_score, sources_match FROM resolution_predictions WHERE id = $1`,
        [predictionId]
      );

      if (predResult.rows.length === 0) {
        throw new Error(`Prediction ${predictionId} not found`);
      }

      const prediction = predResult.rows[0];
      // Prediction is accurate if:
      // - High score (>= 65) predicted same resolution AND they resolved same
      // - Low score (< 65) predicted different resolution AND they resolved differently
      const highScorePredictedSame = prediction.predicted_score >= 65;
      const predictionAccurate = (highScorePredictedSame && resolvedSame) ||
                                  (!highScorePredictedSame && !resolvedSame);

      const profitDeviation = outcome.actualProfit !== undefined && outcome.expectedProfit !== undefined
        ? outcome.actualProfit - outcome.expectedProfit
        : null;

      const result = await client.query(
        `INSERT INTO resolution_outcomes (
          prediction_id, position_id, resolved_same,
          exchange1_outcome, exchange2_outcome, resolution_reason,
          outcome_notes, actual_profit, expected_profit, profit_deviation,
          prediction_accurate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          predictionId,
          positionId,
          resolvedSame,
          outcome.exchange1Outcome,
          outcome.exchange2Outcome,
          outcome.resolutionReason || null,
          outcome.outcomeNotes || null,
          outcome.actualProfit || null,
          outcome.expectedProfit || null,
          profitDeviation,
          predictionAccurate
        ]
      );

      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  /**
   * Get calibration summary by score buckets
   */
  async getCalibrationSummary(): Promise<CalibrationSummary> {
    const client = await this.pool.connect();
    try {
      // Get overall stats
      const overallResult = await client.query(`
        SELECT
          COUNT(DISTINCT p.id) as total_predictions,
          COUNT(o.id) as total_resolutions,
          ROUND(100.0 * SUM(CASE WHEN o.resolved_same THEN 1 ELSE 0 END) / NULLIF(COUNT(o.id), 0), 2) as same_rate,
          ROUND(100.0 * SUM(CASE WHEN o.prediction_accurate THEN 1 ELSE 0 END) / NULLIF(COUNT(o.id), 0), 2) as accuracy_rate
        FROM resolution_predictions p
        LEFT JOIN resolution_outcomes o ON o.prediction_id = p.id
      `);

      const overall = overallResult.rows[0];

      // Get bucketed stats
      const bucketResult = await client.query(`SELECT * FROM v_resolution_calibration`);

      const buckets: CalibrationBucket[] = bucketResult.rows.map((row: any) => ({
        scoreBucket: row.score_bucket,
        totalPredictions: parseInt(row.total_predictions),
        resolvedSameCount: parseInt(row.resolved_same_count),
        accurateCount: parseInt(row.accurate_count),
        sameResolutionRate: parseFloat(row.same_resolution_rate) || 0,
        accuracyRate: parseFloat(row.accuracy_rate) || 0,
        avgPredictedScore: parseFloat(row.avg_predicted_score) || 0,
        avgProfitDeviation: row.avg_profit_deviation ? parseFloat(row.avg_profit_deviation) : undefined
      }));

      // Get by exchange pair
      const exchangeResult = await client.query(`SELECT * FROM v_resolution_calibration_by_exchange`);

      const byExchangePair = new Map<string, CalibrationBucket[]>();
      for (const row of exchangeResult.rows) {
        const pair = row.exchange_pair;
        if (!byExchangePair.has(pair)) {
          byExchangePair.set(pair, []);
        }
        byExchangePair.get(pair)!.push({
          scoreBucket: row.score_bucket,
          totalPredictions: parseInt(row.total),
          resolvedSameCount: 0,
          accurateCount: 0,
          sameResolutionRate: parseFloat(row.same_rate) || 0,
          accuracyRate: parseFloat(row.accuracy_rate) || 0,
          avgPredictedScore: 0,
          avgProfitDeviation: undefined
        });
      }

      return {
        totalPredictions: parseInt(overall.total_predictions) || 0,
        totalResolutions: parseInt(overall.total_resolutions) || 0,
        overallSameRate: parseFloat(overall.same_rate) || 0,
        overallAccuracyRate: parseFloat(overall.accuracy_rate) || 0,
        buckets,
        byExchangePair
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get prediction by position ID
   */
  async getPredictionByPosition(positionId: string): Promise<ResolutionPredictionRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM resolution_predictions WHERE position_id = $1 ORDER BY predicted_at DESC LIMIT 1`,
      [positionId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      positionId: row.position_id,
      opportunityId: row.opportunity_id,
      predictedScore: row.predicted_score,
      predictedLevel: row.predicted_level,
      sourcesMatch: row.sources_match,
      timingMatch: row.timing_match,
      conditionsMatch: row.conditions_match,
      temporalDistance: row.temporal_distance,
      exchangePair: row.exchange_pair,
      market1Id: row.market1_id,
      market2Id: row.market2_id,
      risks: row.risks || [],
      warnings: row.warnings || [],
      polymarket5050Risk: row.polymarket_5050_risk,
      predictedAt: row.predicted_at
    };
  }

  /**
   * Get monthly trend data for dashboard
   */
  async getMonthlyTrend(): Promise<Array<{
    month: Date;
    totalResolutions: number;
    sameRate: number;
    avgPredictedScore: number;
    avgProfit: number;
  }>> {
    const result = await this.pool.query(`SELECT * FROM v_resolution_monthly_trend`);

    return result.rows.map((row: any) => ({
      month: new Date(row.month),
      totalResolutions: parseInt(row.total_resolutions),
      sameRate: parseFloat(row.same_rate) || 0,
      avgPredictedScore: parseFloat(row.avg_predicted_score) || 0,
      avgProfit: parseFloat(row.avg_profit) || 0
    }));
  }

  /**
   * Check if calibration data suggests threshold adjustment
   * Returns recommended threshold if current threshold seems suboptimal
   */
  async getThresholdRecommendation(currentThreshold: number): Promise<{
    recommendedThreshold: number;
    reason: string;
  } | null> {
    const summary = await this.getCalibrationSummary();

    if (summary.totalResolutions < 10) {
      return null; // Not enough data
    }

    // Find the bucket where same-resolution rate drops below acceptable level
    const acceptableRate = 90; // 90% same-resolution rate is acceptable
    let recommendedThreshold = currentThreshold;
    let reason = '';

    for (const bucket of summary.buckets) {
      // Parse the bucket range
      const match = bucket.scoreBucket.match(/(\d+)-(\d+)/);
      if (!match) continue;

      const bucketMin = parseInt(match[1]);

      if (bucket.sameResolutionRate < acceptableRate && bucket.totalPredictions >= 5) {
        // This bucket has too many divergent resolutions
        recommendedThreshold = Math.max(recommendedThreshold, bucketMin + 5);
        reason = `Score bucket ${bucket.scoreBucket} has only ${bucket.sameResolutionRate}% same-resolution rate`;
      }
    }

    if (recommendedThreshold !== currentThreshold) {
      return { recommendedThreshold, reason };
    }

    return null;
  }

  /**
   * Close database connections
   */
  async disconnect(): Promise<void> {
    await this.pool.end();
  }
}
