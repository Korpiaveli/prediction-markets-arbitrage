import { Router, Request, Response } from 'express';
import { ApiContext } from '../types';

export function createScannerRoutes(context: ApiContext): Router {
  const router = Router();

  // GET /api/scanner/status - Get scanner status
  router.get('/status', (_req: Request, res: Response) => {
    if (!context.scanner) {
      return res.json({
        success: true,
        data: {
          running: false,
          message: 'Scanner not initialized'
        }
      });
    }

    return res.json({
      success: true,
      data: {
        running: true, // Would need to track this state
        exchanges: context.exchanges.map(e => e.name)
      }
    });
  });

  // POST /api/scanner/scan - Trigger a scan
  router.post('/scan', async (_req: Request, res: Response) => {
    try {
      if (!context.scanner) {
        return res.status(400).json({
          success: false,
          error: 'Scanner not initialized'
        });
      }

      const opportunities = await context.scanner.scan();

      return res.json({
        success: true,
        data: {
          count: opportunities.length,
          opportunities: opportunities.slice(0, 10) // Return top 10
        }
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
