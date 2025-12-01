import { Router, Request, Response } from 'express';
import { ApiContext, ApiResponse } from '../types';
import { ArbitrageOpportunity } from '@arb/core';

export function createOpportunityRoutes(context: ApiContext): Router {
  const router = Router();

  // GET /api/opportunities - List all opportunities
  router.get('/', async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const minProfit = parseFloat(req.query.minProfit as string) || 0;

      const opportunities = await context.storage.getOpportunities({
        limit: limit * page,
        orderBy: 'timestamp',
        order: 'desc'
      });

      // Filter by profit
      const filtered = opportunities
        .filter(o => o.profitPercent >= minProfit)
        .slice((page - 1) * limit, page * limit);

      const total = opportunities.filter(o => o.profitPercent >= minProfit).length;

      const response: ApiResponse<ArbitrageOpportunity[]> = {
        success: true,
        data: filtered,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

      return res.json(response);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/opportunities/:id - Get specific opportunity
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const opportunity = await context.storage.getOpportunity(req.params.id);

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error: 'Opportunity not found'
        });
      }

      return res.json({
        success: true,
        data: opportunity
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/opportunities/stats - Get statistics
  router.get('/stats/summary', async (_req: Request, res: Response) => {
    try {
      const opportunities = await context.storage.getOpportunities({
        limit: 1000
      });

      const stats = {
        total: opportunities.length,
        avgProfit: opportunities.reduce((sum, o) => sum + o.profitPercent, 0) / opportunities.length || 0,
        maxProfit: Math.max(...opportunities.map(o => o.profitPercent), 0),
        minProfit: Math.min(...opportunities.map(o => o.profitPercent), 0),
        avgConfidence: opportunities.reduce((sum, o) => sum + o.confidence, 0) / opportunities.length || 0,
        validCount: opportunities.filter(o => o.valid).length
      };

      return res.json({
        success: true,
        data: stats
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
