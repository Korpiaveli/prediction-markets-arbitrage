/**
 * Recommendations API Routes
 *
 * Endpoints for opportunity recommendations with scoring and ranking
 */

import { Router, Request, Response } from 'express';
import { RecommendationEngine } from '@arb/ml';
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

  return router;
}
