/**
 * Real-Time Scanner CLI Demo
 *
 * Demonstrates real-time arbitrage detection with WebSocket feeds,
 * Redis caching, and Discord/Telegram alerts.
 */

import { RealTimeScanner } from '../src/scanner/realtime';
import { KalshiAdapter } from '@arb/exchanges';
import { PolymarketAdapter } from '@arb/exchanges';
import { ArbitrageCalculator } from '@arb/math';

async function main() {
  console.log('='.repeat(60));
  console.log('Real-Time Arbitrage Scanner Demo');
  console.log('='.repeat(60));
  console.log();

  const kalshiAdapter = new KalshiAdapter();
  const polyAdapter = new PolymarketAdapter();
  const calculator = new ArbitrageCalculator();

  const scanner = new RealTimeScanner({
    scanner: {
      exchanges: [kalshiAdapter, polyAdapter],
      calculator,
      maxConcurrent: 10
    },
    cache: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    },
    alerts: {
      discord: {
        webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
        enabled: !!process.env.DISCORD_WEBHOOK_URL,
        minProfitPercent: 5
      },
      telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        chatId: process.env.TELEGRAM_CHAT_ID || '',
        enabled: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,
        minProfitPercent: 5
      }
    },
    scanThrottleMs: 1000
  });

  scanner.on('opportunity', (alert) => {
    console.log('\n🎯 ARBITRAGE OPPORTUNITY DETECTED');
    console.log('-'.repeat(60));
    console.log(`ID: ${alert.opportunityId}`);
    console.log(`Profit: ${alert.profitPercent.toFixed(2)}%`);
    console.log(`Investment: $${alert.investmentRequired.toFixed(2)}`);
    console.log(`Direction: ${alert.direction}`);
    console.log(`Kalshi: ${alert.kalshiMarket}`);
    console.log(`Polymarket: ${alert.polymarketMarket}`);
    if (alert.confidence) {
      console.log(`Confidence: ${alert.confidence}%`);
    }
    if (alert.resolutionRisk) {
      console.log(`Resolution Risk: ${alert.resolutionRisk}`);
    }
    console.log('-'.repeat(60));
  });

  scanner.on('error', (error) => {
    console.error('\n❌ ERROR:', error.message);
  });

  scanner.on('metrics', () => {
    console.log('\n📊 METRICS UPDATE');
    console.log(scanner.getReport());
  });

  console.log('Starting real-time scanner...');
  await scanner.start();

  console.log('✅ Scanner started successfully');
  console.log('📡 WebSocket feeds connected');
  console.log('💾 Redis cache connected');
  console.log('🔔 Alert system ready');
  console.log();
  console.log('Monitoring for arbitrage opportunities...');
  console.log('Press Ctrl+C to stop');
  console.log();

  setInterval(() => {
    console.log('\n' + scanner.getReport());
    console.log('\nCache Stats:', scanner.getCacheStats());
    console.log('Alert Stats:', scanner.getAlertStats());
  }, 30000);

  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    await scanner.stop();
    console.log('Scanner stopped');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
