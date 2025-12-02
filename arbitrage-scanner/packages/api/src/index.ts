/**
 * @arb/api - REST API Server
 *
 * Provides REST endpoints for:
 * - Opportunity retrieval and filtering
 * - Scanner control (start/stop)
 * - Market exploration
 * - Backtest execution
 * - Pattern analysis
 * - Configuration management
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Server } from 'http';
import { WebSocketServer } from 'ws';

import { createOpportunityRoutes } from './routes/opportunities';
import { createScannerRoutes } from './routes/scanner';
import { createMarketRoutes } from './routes/markets';
import { createBacktestRoutes } from './routes/backtest';
import { createConfigRoutes } from './routes/config';
import { createMLRoutes } from './routes/ml';
import { createWebSocketHandler } from './websocket';
import { ApiConfig, ApiContext } from './types';

export class ApiServer {
  private app: Express;
  private server?: Server;
  private wss?: WebSocketServer;
  private config: ApiConfig;
  private context: ApiContext;

  constructor(config: ApiConfig, context: ApiContext) {
    this.config = config;
    this.context = context;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware() {
    // Security
    this.app.use(helmet());
    this.app.use(cors({
      origin: this.config.corsOrigin || '*',
      credentials: true
    }));

    // Performance
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: this.config.rateLimit?.max || 100,
      message: 'Too many requests from this IP'
    });
    this.app.use('/api/', limiter);

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // API routes
    this.app.use('/api/opportunities', createOpportunityRoutes(this.context));
    this.app.use('/api/scanner', createScannerRoutes(this.context));
    this.app.use('/api/markets', createMarketRoutes(this.context));
    this.app.use('/api/backtest', createBacktestRoutes(this.context));
    this.app.use('/api/config', createConfigRoutes(this.context));
    this.app.use('/api/ml', createMLRoutes(this.context));

    // API documentation
    this.app.get('/api', (_req: Request, res: Response) => {
      res.json({
        name: 'Arbitrage Scanner API',
        version: '1.0.0',
        endpoints: {
          opportunities: '/api/opportunities',
          scanner: '/api/scanner',
          markets: '/api/markets',
          backtest: '/api/backtest',
          config: '/api/config',
          ml: '/api/ml'
        },
        websocket: {
          enabled: this.config.enableWebSocket,
          path: '/ws'
        }
      });
    });

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        path: _req.path
      });
    });
  }

  private setupErrorHandling() {
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('[API] Error:', err);

      res.status(500).json({
        error: 'Internal server error',
        message: this.config.debug ? err.message : 'An error occurred'
      });
    });
  }

  async start(): Promise<void> {
    const maxPortAttempts = 5;
    let currentPort = this.config.port;
    let attempts = 0;

    while (attempts < maxPortAttempts) {
      try {
        await this.tryListen(currentPort);
        this.config.port = currentPort;
        return;
      } catch (error: any) {
        if (error.code === 'EADDRINUSE') {
          attempts++;
          console.warn(`[API] Port ${currentPort} is in use (attempt ${attempts}/${maxPortAttempts})`);

          if (attempts < maxPortAttempts) {
            currentPort++;
            console.log(`[API] Trying port ${currentPort}...`);
          } else {
            throw new Error(
              `Failed to start server: Ports ${this.config.port}-${currentPort} are all in use. ` +
              `Please stop other processes or choose a different port.`
            );
          }
        } else {
          throw error;
        }
      }
    }
  }

  private tryListen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, () => {
        console.log(`[API] Server listening on port ${port}`);
        console.log(`[API] Health check: http://localhost:${port}/health`);
        console.log(`[API] Documentation: http://localhost:${port}/api`);

        // Set up WebSocket if enabled
        if (this.config.enableWebSocket && this.server) {
          this.wss = new WebSocketServer({ server: this.server, path: '/ws' });
          createWebSocketHandler(this.wss, this.context);
          console.log(`[API] WebSocket enabled at ws://localhost:${port}/ws`);
        }

        resolve();
      });

      this.server?.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          reject(error);
        } else {
          console.error('[API] Server error:', error);
          reject(error);
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.wss) {
        this.wss.close();
      }

      if (this.server) {
        this.server.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log('[API] Server stopped');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  getApp(): Express {
    return this.app;
  }
}

export * from './types';
