import { Router, Request, Response } from 'express';
import { ApiContext } from '../types';

export function createConfigRoutes(context: ApiContext): Router {
  const router = Router();

  // GET /api/config - Get current configuration
  router.get('/', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        exchanges: context.exchanges.map(e => ({
          name: e.name,
          enabled: true
        })),
        storage: {
          type: 'json',
          enabled: true
        },
        features: {
          scanner: !!context.scanner,
          backtest: true,
          patterns: true
        }
      }
    });
  });

  return router;
}
