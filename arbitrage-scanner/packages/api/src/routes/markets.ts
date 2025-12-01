import { Router, Request, Response } from 'express';
import { ApiContext } from '../types';

export function createMarketRoutes(context: ApiContext): Router {
  const router = Router();

  // GET /api/markets - List markets from exchanges
  router.get('/', async (req: Request, res: Response) => {
    try {
      const exchange = req.query.exchange as string;
      const limit = parseInt(req.query.limit as string) || 50;

      const results = [];

      for (const ex of context.exchanges) {
        if (exchange && ex.name.toLowerCase() !== exchange.toLowerCase()) {
          continue;
        }

        const markets = await ex.getMarkets();

        results.push({
          exchange: ex.name,
          count: markets.length,
          markets: markets.slice(0, limit)
        });
      }

      res.json({
        success: true,
        data: results
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}
