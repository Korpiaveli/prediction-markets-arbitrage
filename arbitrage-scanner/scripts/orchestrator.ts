#!/usr/bin/env npx tsx
/**
 * Service Orchestrator
 *
 * Manages all arbitrage scanner services from a single process.
 *
 * Usage:
 *   npm run start:all              # Start all services
 *   npm run start:all -- --no-web  # Start API only
 *   npm run start:all -- --rebuild # Rebuild before starting
 *   npm run status                 # Check service status
 *   npm run stop                   # Stop all services
 */

import * as path from 'path';
import * as fs from 'fs';
import { logger, apiLogger, webLogger, COLORS } from './lib/logger';
import { processRunner, ProcessConfig } from './lib/process-runner';
import { checkRequiredPorts, DEFAULT_PORTS, parsePortOverrides, PortConfig } from './lib/port-utils';
import { waitForService, checkAllServices, formatServiceStatus, ServiceStatus } from './lib/health-check';
import { spawnSync } from 'child_process';

interface OrchestratorOptions {
  rebuild: boolean;
  noApi: boolean;
  noWeb: boolean;
  dev: boolean;
  status: boolean;
  stop: boolean;
  ports: PortConfig;
}

const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(): OrchestratorOptions {
  const args = process.argv.slice(2);
  const portOverrides = parsePortOverrides(args);

  return {
    rebuild: args.includes('--rebuild'),
    noApi: args.includes('--no-api'),
    noWeb: args.includes('--no-web'),
    dev: args.includes('--dev') || process.env.NODE_ENV === 'development',
    status: args.includes('--status'),
    stop: args.includes('--stop'),
    ports: { ...DEFAULT_PORTS, ...portOverrides }
  };
}

function checkBuildExists(): boolean {
  const requiredPaths = [
    'apps/api/dist/server.js',
    'apps/web/.next'
  ];

  for (const p of requiredPaths) {
    if (!fs.existsSync(path.join(ROOT_DIR, p))) {
      return false;
    }
  }
  return true;
}

function runBuild(): boolean {
  logger.info('Building project...');

  const result = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: true
  });

  return result.status === 0;
}

async function showStatus(ports: PortConfig): Promise<void> {
  logger.header('Service Status');

  const services = [
    { name: 'API', url: `http://localhost:${ports.api}/health` },
    { name: 'Web', url: `http://localhost:${ports.web}` }
  ];

  const results = await checkAllServices(services);

  const statuses: ServiceStatus[] = results.map((r) => ({
    name: r.name,
    running: r.result.healthy,
    healthy: r.result.healthy,
    url: services.find((s) => s.name === r.name)?.url || ''
  }));

  console.log(formatServiceStatus(statuses));
  logger.blank();
}

async function stopServices(): Promise<void> {
  logger.info('Stopping all services...');
  await processRunner.stopAll(5000);
  logger.success('All services stopped');
}

async function startApi(ports: PortConfig, dev: boolean): Promise<boolean> {
  const config: ProcessConfig = {
    name: 'API',
    command: 'node',
    args: dev ? ['--import', 'tsx', 'src/server.ts'] : ['dist/server.js'],
    cwd: path.join(ROOT_DIR, 'apps/api'),
    env: {
      PORT: ports.api.toString(),
      NODE_ENV: dev ? 'development' : 'production'
    },
    logger: apiLogger,
    restartOnCrash: true,
    maxRestarts: 3,
    restartDelayMs: 2000
  };

  await processRunner.start(config);

  // Wait for health check
  logger.info(`Waiting for API to be ready on port ${ports.api}...`);

  const ready = await waitForService(`http://localhost:${ports.api}/health`, {
    timeoutMs: 30000,
    intervalMs: 1000
  });

  if (!ready) {
    logger.error('API failed to start');
    return false;
  }

  logger.success(`API ready at http://localhost:${ports.api}`);
  return true;
}

async function startWeb(ports: PortConfig, dev: boolean): Promise<boolean> {
  const config: ProcessConfig = {
    name: 'Web',
    command: 'npm',
    args: dev ? ['run', 'dev', '--', '-p', ports.web.toString()] : ['run', 'start', '--', '-p', ports.web.toString()],
    cwd: path.join(ROOT_DIR, 'apps/web'),
    env: {
      PORT: ports.web.toString(),
      NEXT_PUBLIC_API_URL: `http://localhost:${ports.api}`,
      NEXT_PUBLIC_WS_URL: `ws://localhost:${ports.api}/ws`
    },
    logger: webLogger,
    restartOnCrash: true,
    maxRestarts: 3,
    restartDelayMs: 2000
  };

  await processRunner.start(config);

  // Wait for web to be ready (longer timeout for Next.js)
  logger.info(`Waiting for Web dashboard to be ready on port ${ports.web}...`);

  const ready = await waitForService(`http://localhost:${ports.web}`, {
    timeoutMs: 60000,
    intervalMs: 2000
  });

  if (!ready) {
    logger.error('Web dashboard failed to start');
    return false;
  }

  logger.success(`Web dashboard ready at http://localhost:${ports.web}`);
  return true;
}

function setupShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    logger.blank();
    logger.info(`Received ${signal}, shutting down...`);
    await processRunner.stopAll(5000);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Windows: Handle Ctrl+C
  if (process.platform === 'win32') {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('SIGINT', () => {
      process.emit('SIGINT');
    });
  }
}

function printStartupBanner(ports: PortConfig): void {
  logger.blank();
  logger.box([
    'Arbitrage Scanner Running',
    '',
    `  API:  http://localhost:${ports.api}`,
    `  Web:  http://localhost:${ports.web}`,
    '',
    'Press Ctrl+C to stop all services'
  ], 'green');
  logger.blank();
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Handle status command
  if (options.status) {
    await showStatus(options.ports);
    return;
  }

  // Handle stop command
  if (options.stop) {
    await stopServices();
    return;
  }

  logger.header('Arbitrage Scanner Orchestrator');

  // Check ports availability
  const portsToCheck = [];
  if (!options.noApi) {
    portsToCheck.push({ name: 'API', port: options.ports.api });
  }
  if (!options.noWeb) {
    portsToCheck.push({ name: 'Web', port: options.ports.web });
  }

  const portCheck = await checkRequiredPorts(portsToCheck);
  if (!portCheck.available) {
    logger.error('Port conflicts detected:');
    for (const conflict of portCheck.conflicts) {
      logger.info(`  ${conflict.name}: port ${conflict.port} is in use`);
    }
    logger.info('Use --port-api or --port-web to specify different ports');
    process.exit(1);
  }

  // Check/run build
  if (options.rebuild || !checkBuildExists()) {
    if (!checkBuildExists()) {
      logger.warn('Build not found, building...');
    }
    if (!runBuild()) {
      logger.error('Build failed');
      process.exit(1);
    }
  }

  // Setup shutdown handlers
  setupShutdownHandlers();

  // Start services
  let success = true;

  if (!options.noApi) {
    success = await startApi(options.ports, options.dev);
    if (!success) {
      await processRunner.stopAll();
      process.exit(1);
    }
  }

  if (!options.noWeb && success) {
    success = await startWeb(options.ports, options.dev);
    if (!success) {
      await processRunner.stopAll();
      process.exit(1);
    }
  }

  if (success) {
    printStartupBanner(options.ports);
  }

  // Keep process alive
  // The process will stay running due to the child processes
}

main().catch((error) => {
  logger.error(`Orchestrator failed: ${error.message}`);
  processRunner.stopAll().finally(() => {
    process.exit(1);
  });
});
