/**
 * Recommendations API Routes
 *
 * Endpoints for opportunity recommendations with scoring and ranking
 */

import { Router, Request, Response } from 'express';
import { RecommendationEngine } from '@arb/ml';
import {
  CapitalTurnoverRanker,
  STRATEGY_PRESETS,
  TurnoverStrategy,
  RankedOpportunity
} from '@arb/scanner';
import { ApiContext } from '../types';

export function createRecommendationRoutes(context: ApiContext): Router {
  const router = Router();

  /**
   * GET /api/recommendations
   * Get ranked recommendations with optional filters
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const opportunities = await context.storage.getOpportunities({ limit: 1000 });

      if (opportunities.length === 0) {
        return res.json({
          success: true,
          data: {
            recommendations: [],
            summary: { totalOpportunities: 0, totalRecommended: 0 }
          }
        });
      }

      const config = {
        topN: parseInt(req.query.top as string) || 10,
        filters: {
          minScore: parseFloat(req.query.minScore as string) || 0,
          minProfit: parseFloat(req.query.minProfit as string) || 0,
          maxHoursToResolution: parseInt(req.query.maxHours as string) || undefined,
          categories: req.query.categories ? (req.query.categories as string).split(',') : undefined,
          riskLevels: req.query.riskLevels
            ? (req.query.riskLevels as string).split(',') as ('low' | 'medium' | 'high' | 'critical')[]
            : undefined
        },
        includeHistoricalContext: req.query.context !== 'false',
        includeReasoning: req.query.reasoning !== 'false'
      };

      const engine = new RecommendationEngine(config);
      const report = engine.generateReport(opportunities as any);

      return res.json({
        success: true,
        data: report
      });
    } catch (error) {
      console.error('[API] Recommendations error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate recommendations',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/recommendations/generate
   * Trigger fresh analysis with custom configuration
   */
  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const opportunities = await context.storage.getOpportunities({ limit: 1000 });

      if (opportunities.length === 0) {
        return res.json({
          success: true,
          data: {
            recommendations: [],
            summary: { totalOpportunities: 0, totalRecommended: 0 }
          }
        });
      }

      const config = {
        topN: req.body.topN || 10,
        weights: req.body.weights || undefined,
        filters: req.body.filters || {},
        includeHistoricalContext: req.body.includeHistoricalContext !== false,
        includeReasoning: req.body.includeReasoning !== false
      };

      const engine = new RecommendationEngine(config);
      const report = engine.generateReport(opportunities as any);

      return res.json({
        success: true,
        data: report
      });
    } catch (error) {
      console.error('[API] Generate recommendations error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate recommendations',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/recommendations/:id
   * Get single recommendation by opportunity ID
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const opportunityId = req.params.id;
      const opportunity = await context.storage.getOpportunity(opportunityId);

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error: 'Opportunity not found'
        });
      }

      const allOpportunities = await context.storage.getOpportunities({ limit: 1000 });
      const engine = new RecommendationEngine({
        topN: allOpportunities.length,
        includeHistoricalContext: true,
        includeReasoning: true
      });
      const recommendations = engine.generateRecommendations(allOpportunities as any);

      const recommendation = recommendations.find(r => r.opportunityId === opportunityId);

      if (!recommendation) {
        const score = engine.scoreOpportunity(opportunity as any);
        return res.json({
          success: true,
          data: {
            opportunityId,
            score,
            rank: null,
            opportunity,
            message: 'Opportunity scored but not in top recommendations'
          }
        });
      }

      return res.json({
        success: true,
        data: {
          recommendation,
          opportunity
        }
      });
    } catch (error) {
      console.error('[API] Get recommendation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get recommendation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/recommendations/score
   * Score a single opportunity without full ranking
   */
  router.post('/score', async (req: Request, res: Response) => {
    try {
      const { opportunity } = req.body;

      if (!opportunity) {
        return res.status(400).json({
          success: false,
          error: 'Opportunity data required'
        });
      }

      const engine = new RecommendationEngine();
      const score = engine.scoreOpportunity(opportunity);

      return res.json({
        success: true,
        data: score
      });
    } catch (error) {
      console.error('[API] Score opportunity error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to score opportunity',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/recommendations/batch-score
   * Score multiple opportunities
   */
  router.post('/batch-score', async (req: Request, res: Response) => {
    try {
      const { opportunities } = req.body;

      if (!Array.isArray(opportunities)) {
        return res.status(400).json({
          success: false,
          error: 'Opportunities array required'
        });
      }

      const engine = new RecommendationEngine();
      const scores = opportunities.map(opp => ({
        opportunityId: opp.id,
        score: engine.scoreOpportunity(opp)
      }));

      scores.sort((a, b) => b.score.overall - a.score.overall);

      return res.json({
        success: true,
        data: {
          scores,
          summary: {
            total: scores.length,
            avgScore: scores.reduce((sum, s) => sum + s.score.overall, 0) / scores.length || 0,
            topScore: scores[0]?.score.overall || 0
          }
        }
      });
    } catch (error) {
      console.error('[API] Batch score error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to batch score',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/recommendations/stats
   * Get recommendation statistics and distribution
   */
  router.get('/stats/summary', async (_req: Request, res: Response) => {
    try {
      const opportunities = await context.storage.getOpportunities({ limit: 1000 });

      if (opportunities.length === 0) {
        return res.json({
          success: true,
          data: {
            totalOpportunities: 0,
            distribution: { low: 0, medium: 0, high: 0, critical: 0 },
            avgScores: { overall: 0, time: 0, profit: 0, confidence: 0 }
          }
        });
      }

      const engine = new RecommendationEngine({ topN: opportunities.length });
      const recommendations = engine.generateRecommendations(opportunities as any);

      const distribution = {
        low: recommendations.filter(r => r.riskLevel === 'low').length,
        medium: recommendations.filter(r => r.riskLevel === 'medium').length,
        high: recommendations.filter(r => r.riskLevel === 'high').length,
        critical: recommendations.filter(r => r.riskLevel === 'critical').length
      };

      const avgScores = {
        overall: recommendations.reduce((sum, r) => sum + r.score.overall, 0) / recommendations.length || 0,
        time: recommendations.reduce((sum, r) => sum + r.score.timeScore, 0) / recommendations.length || 0,
        profit: recommendations.reduce((sum, r) => sum + r.score.profitScore, 0) / recommendations.length || 0,
        confidence: recommendations.reduce((sum, r) => sum + r.score.confidenceScore, 0) / recommendations.length || 0
      };

      const scoreDistribution = {
        excellent: recommendations.filter(r => r.score.overall >= 80).length,
        good: recommendations.filter(r => r.score.overall >= 60 && r.score.overall < 80).length,
        fair: recommendations.filter(r => r.score.overall >= 40 && r.score.overall < 60).length,
        poor: recommendations.filter(r => r.score.overall < 40).length
      };

      return res.json({
        success: true,
        data: {
          totalOpportunities: opportunities.length,
          totalScored: recommendations.length,
          riskDistribution: distribution,
          scoreDistribution,
          avgScores: {
            overall: Math.round(avgScores.overall * 10) / 10,
            time: Math.round(avgScores.time * 10) / 10,
            profit: Math.round(avgScores.profit * 10) / 10,
            confidence: Math.round(avgScores.confidence * 10) / 10
          }
        }
      });
    } catch (error) {
      console.error('[API] Recommendation stats error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get stats',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/recommendations/compounding
   * Get opportunities ranked by capital turnover optimization
   */
  router.get('/compounding', async (req: Request, res: Response) => {
    try {
      const opportunities = await context.storage.getOpportunities({ limit: 1000 });

      if (opportunities.length === 0) {
        return res.json({
          success: true,
          data: {
            opportunities: [],
            statistics: { totalOpportunities: 0, qualifiedCount: 0 }
          }
        });
      }

      const strategy = (req.query.strategy as TurnoverStrategy) || 'balanced';
      const capital = parseFloat(req.query.capital as string) || 10000;
      const maxDays = parseInt(req.query.maxDays as string) || undefined;
      const minConfidence = parseInt(req.query.minConfidence as string) || undefined;
      const limit = parseInt(req.query.limit as string) || 50;

      const ranker = new CapitalTurnoverRanker({ strategy, capital });
      const ranked = ranker.rank(opportunities as any);

      let filtered: RankedOpportunity[] = ranked;
      if (maxDays) {
        filtered = filtered.filter((r: RankedOpportunity) => r.turnoverScore.daysToResolution <= maxDays);
      }
      if (minConfidence) {
        filtered = filtered.filter((r: RankedOpportunity) => r.turnoverScore.confidenceScore >= minConfidence);
      }

      const statistics = ranker.getStatistics(opportunities as any);

      return res.json({
        success: true,
        data: {
          opportunities: filtered.slice(0, limit).map((r: RankedOpportunity) => ({
            id: r.opportunity.id,
            market1Title: r.opportunity.marketPair.market1.title,
            market2Title: r.opportunity.marketPair.market2.title,
            exchange1: r.opportunity.marketPair.exchange1,
            exchange2: r.opportunity.marketPair.exchange2,
            profitPercent: r.opportunity.profitPercent,
            confidence: r.opportunity.confidence,
            turnoverScore: r.turnoverScore,
            meetsRequirements: r.meetsStrategyRequirements,
            category: r.category
          })),
          statistics,
          strategy: STRATEGY_PRESETS[strategy],
          capital
        }
      });
    } catch (error) {
      console.error('[API] Compounding opportunities error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get compounding opportunities',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/recommendations/project
   * Project returns based on capital, strategy, and period
   */
  router.post('/project', async (req: Request, res: Response) => {
    try {
      const {
        capital = 10000,
        strategy = 'balanced',
        period = 'annual',
        customWeights,
        opportunityIds
      } = req.body;

      const opportunities = await context.storage.getOpportunities({ limit: 1000 });

      if (opportunities.length === 0) {
        return res.json({
          success: true,
          data: {
            projection: {
              startingCapital: capital,
              endingCapital: capital,
              totalReturn: 0,
              returnPercent: 0,
              expectedTrades: 0,
              expectedWins: 0,
              expectedLosses: 0,
              confidenceInterval: { low: capital, high: capital },
              period,
              strategy
            }
          }
        });
      }

      const ranker = new CapitalTurnoverRanker({
        strategy,
        customWeights,
        capital
      });

      let selectedOpps = opportunities as any;
      if (opportunityIds && Array.isArray(opportunityIds) && opportunityIds.length > 0) {
        selectedOpps = opportunities.filter(o => opportunityIds.includes(o.id));
      }

      const ranked = ranker.rankFiltered(selectedOpps);
      const projection = ranker.projectReturns(capital, period, ranked);

      const enrichedOpportunities = ranked.slice(0, 10).map((r: RankedOpportunity) => ({
        id: r.opportunity.id,
        market1Title: r.opportunity.marketPair.market1.title,
        market2Title: r.opportunity.marketPair.market2.title,
        profitPercent: r.opportunity.profitPercent,
        daysToResolution: r.turnoverScore.daysToResolution,
        annualizedReturn: r.turnoverScore.annualizedReturn,
        positionSizing: ranker.calculatePositionSizing(r.opportunity, capital)
      }));

      return res.json({
        success: true,
        data: {
          projection,
          topOpportunities: enrichedOpportunities,
          strategyConfig: STRATEGY_PRESETS[strategy as TurnoverStrategy],
          inputParams: { capital, strategy, period, customWeights }
        }
      });
    } catch (error) {
      console.error('[API] Project returns error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to project returns',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/recommendations/confidence-stats
   * Get historical win rates by confidence bucket
   */
  router.get('/confidence-stats', async (_req: Request, res: Response) => {
    try {
      const opportunities = await context.storage.getOpportunities({ limit: 1000 });

      const confidenceBuckets = [
        { range: '95-100', min: 95, max: 100, expectedWinRate: 0.99 },
        { range: '85-94', min: 85, max: 94, expectedWinRate: 0.95 },
        { range: '75-84', min: 75, max: 84, expectedWinRate: 0.90 },
        { range: '<75', min: 0, max: 74, expectedWinRate: 0.80 }
      ];

      const stats = confidenceBuckets.map(bucket => {
        const inBucket = opportunities.filter(
          o => o.confidence >= bucket.min && o.confidence <= bucket.max
        );
        const avgProfit = inBucket.length > 0
          ? inBucket.reduce((sum, o) => sum + o.profitPercent, 0) / inBucket.length
          : 0;

        return {
          confidenceRange: bucket.range,
          count: inBucket.length,
          expectedWinRate: bucket.expectedWinRate,
          avgProfitPercent: Math.round(avgProfit * 100) / 100,
          expectedAnnualReturn: calculateBucketAnnualReturn(
            avgProfit,
            bucket.expectedWinRate,
            30 // assume 30-day avg resolution
          )
        };
      });

      const totalOpportunities = opportunities.length;
      const avgConfidence = totalOpportunities > 0
        ? opportunities.reduce((sum, o) => sum + o.confidence, 0) / totalOpportunities
        : 0;

      return res.json({
        success: true,
        data: {
          buckets: stats,
          summary: {
            totalOpportunities,
            avgConfidence: Math.round(avgConfidence * 10) / 10,
            recommendedStrategy: avgConfidence >= 85 ? 'conservative' :
                                 avgConfidence >= 75 ? 'balanced' : 'aggressive'
          }
        }
      });
    } catch (error) {
      console.error('[API] Confidence stats error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get confidence stats',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/recommendations/position-size
   * Calculate position sizing for a specific opportunity
   */
  router.post('/position-size', async (req: Request, res: Response) => {
    try {
      const {
        opportunityId,
        bankroll = 10000,
        strategy = 'balanced'
      } = req.body;

      if (!opportunityId) {
        return res.status(400).json({
          success: false,
          error: 'opportunityId is required'
        });
      }

      const opportunity = await context.storage.getOpportunity(opportunityId);

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error: 'Opportunity not found'
        });
      }

      const ranker = new CapitalTurnoverRanker({ strategy });
      const positionSizing = ranker.calculatePositionSizing(opportunity as any, bankroll);
      const enriched = ranker.enrichOpportunityWithMetrics(opportunity as any, bankroll);

      return res.json({
        success: true,
        data: {
          opportunityId,
          bankroll,
          strategy,
          positionSizing,
          turnoverMetrics: enriched.turnoverMetrics,
          recommendation: getPositionRecommendation(positionSizing, enriched.turnoverMetrics!)
        }
      });
    } catch (error) {
      console.error('[API] Position size error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to calculate position size',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/recommendations/long-term
   * Get opportunities with resolution > 90 days
   */
  router.get('/long-term', async (req: Request, res: Response) => {
    try {
      const opportunities = await context.storage.getOpportunities({ limit: 1000 });
      const minDays = parseInt(req.query.minDays as string) || 90;
      const limit = parseInt(req.query.limit as string) || 20;
      const strategy = (req.query.strategy as TurnoverStrategy) || 'balanced';

      const ranker = new CapitalTurnoverRanker({ strategy });
      const longTerm = ranker.getLongTermOpportunities(opportunities as any);

      const filtered = longTerm
        .filter((r: RankedOpportunity) => r.turnoverScore.daysToResolution >= minDays)
        .slice(0, limit);

      return res.json({
        success: true,
        data: {
          opportunities: filtered.map((r: RankedOpportunity) => ({
            id: r.opportunity.id,
            market1Title: r.opportunity.marketPair.market1.title,
            market2Title: r.opportunity.marketPair.market2.title,
            exchange1: r.opportunity.marketPair.exchange1,
            exchange2: r.opportunity.marketPair.exchange2,
            profitPercent: r.opportunity.profitPercent,
            confidence: r.opportunity.confidence,
            daysToResolution: r.turnoverScore.daysToResolution,
            resolutionDate: r.opportunity.marketPair.market1.closeTime ||
                           r.opportunity.marketPair.market2.closeTime,
            annualizedReturn: r.turnoverScore.annualizedReturn,
            capitalLockupWarning: getCapitalLockupWarning(r.turnoverScore.daysToResolution)
          })),
          summary: {
            totalLongTerm: longTerm.length,
            avgDaysToResolution: longTerm.length > 0
              ? Math.round(longTerm.reduce((s: number, r: RankedOpportunity) => s + r.turnoverScore.daysToResolution, 0) / longTerm.length)
              : 0,
            avgProfitPercent: longTerm.length > 0
              ? Math.round(longTerm.reduce((s: number, r: RankedOpportunity) => s + r.opportunity.profitPercent, 0) / longTerm.length * 100) / 100
              : 0
          }
        }
      });
    } catch (error) {
      console.error('[API] Long-term opportunities error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get long-term opportunities',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

function calculateBucketAnnualReturn(
  avgProfitPercent: number,
  winRate: number,
  avgDaysToRes: number
): number {
  if (avgProfitPercent === 0 || avgDaysToRes === 0) return 0;

  const turnsPerYear = 365 / avgDaysToRes;
  const lossRate = 0.50;
  const expectedPerTrade = (avgProfitPercent / 100 * winRate) - (lossRate * (1 - winRate));
  const annualized = (Math.pow(1 + expectedPerTrade, turnsPerYear) - 1) * 100;

  return Math.round(annualized * 100) / 100;
}

function getCapitalLockupWarning(days: number): string {
  if (days >= 365) return 'Very long lock-up (1+ year). Consider opportunity cost.';
  if (days >= 180) return 'Long lock-up (6+ months). Capital tied up for extended period.';
  if (days >= 90) return 'Medium lock-up (3+ months). Plan capital allocation.';
  return 'Moderate lock-up period.';
}

function getPositionRecommendation(
  _sizing: { kellyPercent: number; halfKellyPercent: number; recommendedAmount?: number },
  metrics: { annualizedReturn: number; expectedWinRate: number; daysToResolution: number }
): string {
  const recommendations: string[] = [];

  if (metrics.expectedWinRate >= 0.95) {
    recommendations.push('High confidence match - full Kelly appropriate for experienced traders.');
  } else if (metrics.expectedWinRate >= 0.90) {
    recommendations.push('Good confidence - half-Kelly recommended for risk management.');
  } else {
    recommendations.push('Lower confidence - consider quarter-Kelly or smaller position.');
  }

  if (metrics.daysToResolution > 60) {
    recommendations.push(`Capital locked for ${Math.round(metrics.daysToResolution)} days - ensure liquidity.`);
  }

  if (metrics.annualizedReturn > 100) {
    recommendations.push(`Strong annualized return (${Math.round(metrics.annualizedReturn)}%) if turnover maintained.`);
  }

  return recommendations.join(' ');
}
