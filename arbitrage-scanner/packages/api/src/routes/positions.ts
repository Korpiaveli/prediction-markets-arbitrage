import { Router, Request, Response } from 'express';
import { ApiContext } from '../types';

export function createPositionRoutes(context: ApiContext): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const positions = await context.storage.getPositions?.() || [];

      return res.json({
        success: true,
        data: positions
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const positions = await context.storage.getPositions?.() || [];
      const position = positions.find((p: any) => p.id === req.params.id);

      if (!position) {
        return res.status(404).json({
          success: false,
          error: 'Position not found'
        });
      }

      return res.json({
        success: true,
        data: position
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const position = {
        id: `pos_${Date.now()}`,
        ...req.body,
        createdAt: new Date().toISOString(),
        status: 'open'
      };

      await context.storage.savePosition?.(position);

      return res.json({
        success: true,
        data: position
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const positions = await context.storage.getPositions?.() || [];
      const position = positions.find((p: any) => p.id === req.params.id);

      if (!position) {
        return res.status(404).json({
          success: false,
          error: 'Position not found'
        });
      }

      const updated = {
        ...position,
        ...req.body,
        updatedAt: new Date().toISOString()
      };

      await context.storage.savePosition?.(updated);

      return res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await context.storage.deletePosition?.(req.params.id);

      return res.json({
        success: true,
        message: 'Position deleted'
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
