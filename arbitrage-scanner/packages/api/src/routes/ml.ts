/**
 * ML & Intelligence API Routes
 *
 * Endpoints for ML predictions, forecasting, and trading strategies
 */

import { Router, Request, Response } from 'express';
import {
  OpportunityPredictor,
  TradingStrategyEvaluator,
  ModelService
} from '@arb/ml';
import { ApiContext } from '../types';

export function createMLRoutes(context: ApiContext): Router {
  const router = Router();

  // Initialize ML services
  const predictor = new OpportunityPredictor();
  const strategyEvaluator = new TradingStrategyEvaluator();
  const modelService = new ModelService();

/**
 * GET /api/ml/forecast/:category
 * Get opportunity forecast for a category
 */
router.get('/forecast/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const hours = parseInt(req.query.hours as string) || 24;

    const historicalOpps = await context.storage.getOpportunities();
    predictor.loadHistoricalData(historicalOpps as any);

    const forecast = predictor.forecast(category, hours);

    res.json({
      success: true,
      data: forecast
    });
  } catch (error) {
    console.error('[API] Forecast error:', error);
    res.status(500).json({
      error: 'Failed to generate forecast',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ml/timing
 * Predict when next opportunity will appear
 */
router.get('/timing', async (_req: Request, res: Response) => {
  try {
    const historicalOpps = await context.storage.getOpportunities();
    predictor.loadHistoricalData(historicalOpps as any);

    const timing = predictor.predictNextOpportunity();
    const probability24h = predictor.probabilityInTimeframe(24);
    const probability1h = predictor.probabilityInTimeframe(1);

    res.json({
      success: true,
      data: {
        ...timing,
        probabilities: {
          next1Hour: probability1h,
          next24Hours: probability24h
        }
      }
    });
  } catch (error) {
    console.error('[API] Timing prediction error:', error);
    res.status(500).json({
      error: 'Failed to predict timing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ml/evaluate
 * Evaluate trading opportunity and get strategy signal
 */
router.post('/evaluate', async (req: Request, res: Response) => {
  try {
    const { opportunity, availableCapital, currentRisk } = req.body;

    if (!opportunity) {
      return res.status(400).json({ error: 'Opportunity data required' });
    }

    const capital = availableCapital || 1000;
    const risk = currentRisk || 0;

    const signal = strategyEvaluator.evaluateOpportunity(
      opportunity,
      capital,
      risk
    );

    return res.json({
      success: true,
      data: signal
    });
  } catch (error) {
    console.error('[API] Strategy evaluation error:', error);
    return res.status(500).json({
      error: 'Failed to evaluate opportunity',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ml/risk-metrics
 * Get current risk metrics and performance stats
 */
router.get('/risk-metrics', async (_req: Request, res: Response) => {
  try {
    const metrics = strategyEvaluator.calculateRiskMetrics();

    return res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('[API] Risk metrics error:', error);
    return res.status(500).json({
      error: 'Failed to calculate risk metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ml/record-trade
 * Record a completed trade for risk tracking
 */
router.post('/record-trade', async (req: Request, res: Response) => {
  try {
    const { profit, timestamp } = req.body;

    if (typeof profit !== 'number') {
      return res.status(400).json({ error: 'Profit amount required' });
    }

    const tradeTime = timestamp ? new Date(timestamp) : new Date();
    strategyEvaluator.recordTrade(profit, tradeTime);

    const updatedMetrics = strategyEvaluator.calculateRiskMetrics();

    return res.json({
      success: true,
      data: {
        recorded: true,
        metrics: updatedMetrics
      }
    });
  } catch (error) {
    console.error('[API] Record trade error:', error);
    return res.status(500).json({
      error: 'Failed to record trade',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ml/strategy-config
 * Get current strategy configuration
 */
router.get('/strategy-config', async (_req: Request, res: Response) => {
  try {
    const config = strategyEvaluator.getConfig();

    return res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[API] Get strategy config error:', error);
    return res.status(500).json({
      error: 'Failed to get strategy config',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/ml/strategy-config
 * Update strategy configuration
 */
router.put('/strategy-config', async (req: Request, res: Response) => {
  try {
    const updates = req.body;

    strategyEvaluator.updateConfig(updates);
    const updatedConfig = strategyEvaluator.getConfig();

    res.json({
      success: true,
      data: updatedConfig
    });
  } catch (error) {
    console.error('[API] Update strategy config error:', error);
    res.status(500).json({
      error: 'Failed to update strategy config',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ml/batch-evaluate
 * Evaluate multiple opportunities at once
 */
router.post('/batch-evaluate', async (req: Request, res: Response) => {
  try {
    const { opportunities, availableCapital, currentRisk } = req.body;

    if (!Array.isArray(opportunities)) {
      return res.status(400).json({ error: 'Opportunities array required' });
    }

    const capital = availableCapital || 1000;
    const risk = currentRisk || 0;

    const signals = opportunities.map(opp =>
      strategyEvaluator.evaluateOpportunity(opp, capital, risk)
    );

    // Sort by action priority: strong_buy > buy > hold > avoid
    const actionPriority: Record<string, number> = { strong_buy: 0, buy: 1, hold: 2, avoid: 3 };
    signals.sort((a, b) => (actionPriority[a.action] || 999) - (actionPriority[b.action] || 999));

    return res.json({
      success: true,
      data: {
        signals,
        summary: {
          total: signals.length,
          strongBuy: signals.filter(s => s.action === 'strong_buy').length,
          buy: signals.filter(s => s.action === 'buy').length,
          hold: signals.filter(s => s.action === 'hold').length,
          avoid: signals.filter(s => s.action === 'avoid').length
        }
      }
    });
  } catch (error) {
    console.error('[API] Batch evaluate error:', error);
    return res.status(500).json({
      error: 'Failed to batch evaluate',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ml/predictions/summary
 * Get summary of all ML predictions
 */
router.get('/predictions/summary', async (_req: Request, res: Response) => {
  try {
    const historicalOpps = await context.storage.getOpportunities();
    predictor.loadHistoricalData(historicalOpps as any);

    const timing = predictor.predictNextOpportunity();
    const politicsForecast = predictor.forecast('politics', 24);
    const sportsForecast = predictor.forecast('sports', 24);
    const metrics = strategyEvaluator.calculateRiskMetrics();

    res.json({
      success: true,
      data: {
        timing,
        forecasts: {
          politics: politicsForecast,
          sports: sportsForecast
        },
        riskMetrics: metrics,
        summary: {
          totalHistoricalOpportunities: historicalOpps.length,
          totalTrades: metrics.totalTrades,
          modelStatus: modelService.isReady() ? 'ready' : 'not_initialized'
        }
      }
    });
  } catch (error) {
    console.error('[API] Predictions summary error:', error);
    res.status(500).json({
      error: 'Failed to get predictions summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

  return router;
}
