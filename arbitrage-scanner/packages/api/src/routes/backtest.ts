import { Router, Request, Response } from 'express';
import { ApiContext } from '../types';
import { BacktestConfig } from '@arb/ml';

export function createBacktestRoutes(context: ApiContext): Router {
  const router = Router();

  // POST /api/backtest/run - Run a backtest
  router.post('/run', async (req: Request, res: Response) => {
    try {
      const {
        days = 30,
        capital = 10000,
        maxPosition = 2000,
        minProfit = 2,
        slippage = 'realistic'
      } = req.body;

      // Load historical data
      const opportunities = await context.storage.getOpportunities({
        limit: 10000,
        orderBy: 'timestamp',
        order: 'asc'
      });

      if (opportunities.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No historical data available'
        });
      }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const config: BacktestConfig = {
        startDate,
        endDate,
        initialCapital: capital,
        maxPositionSize: maxPosition,
        minProfitPercent: minProfit,
        slippageModel: slippage,
        executionDelay: 5
      };

      const result = context.backtester.run(opportunities as any, config);

      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}
