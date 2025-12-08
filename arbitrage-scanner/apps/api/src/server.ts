import { ApiServer } from '@arb/api';
import { KalshiAdapter, PredictItAdapter, PolymarketAdapter } from '@arb/exchanges';
import { Scanner } from '@arb/scanner';
import { JsonStorage } from '@arb/storage';
import { BacktestEngine, PatternAnalyzer } from '@arb/ml';
import { ArbitrageCalculator } from '@arb/math';
import path from 'path';

async function main() {
  console.log('[Server] Starting Arbitrage Scanner API...');

  // Initialize storage - use absolute path to find data directory
  const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../../../data');
  const storage = new JsonStorage({ dataDir });
  await storage.connect();

  // Initialize exchanges - support Kalshi, PredictIt, and Polymarket
  const exchanges = [
    new KalshiAdapter({
      apiKey: process.env.KALSHI_API_KEY,
      timeout: 5000
    }),
    new PredictItAdapter({
      timeout: 5000
    }),
    new PolymarketAdapter({
      timeout: 5000
    })
  ];

  // Initialize calculator
  const calculator = new ArbitrageCalculator();

  // Initialize scanner (optional - can be null)
  let scanner: Scanner | undefined;
  try {
    scanner = new Scanner({
      exchanges,
      calculator,
      storage,
      scanInterval: 300000 // 5 minutes
    });
    console.log('[Server] Scanner initialized');
  } catch (error) {
    console.warn('[Server] Scanner initialization failed:', error);
  }

  // Initialize ML components
  const backtester = new BacktestEngine();
  const patternAnalyzer = new PatternAnalyzer();

  // Create API server
  const apiServer = new ApiServer(
    {
      port: parseInt(process.env.PORT || '3001'),
      corsOrigin: process.env.CORS_ORIGIN || '*',
      enableWebSocket: process.env.ENABLE_WS !== 'false',
      rateLimit: {
        max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000')
      },
      debug: process.env.NODE_ENV !== 'production'
    },
    {
      scanner,
      storage,
      exchanges,
      backtester,
      patternAnalyzer
    }
  );

  // Start server
  await apiServer.start();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Server] Shutting down...');
    await apiServer.stop();
    await storage.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[Server] Shutting down...');
    await apiServer.stop();
    await storage.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('[Server] Fatal error:', error);
  process.exit(1);
});
