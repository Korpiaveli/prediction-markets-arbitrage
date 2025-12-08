#!/usr/bin/env npx tsx
/**
 * Setup Script
 *
 * One-command setup for the arbitrage scanner.
 * Handles: version check, install, env setup, build, validation.
 *
 * Usage:
 *   npm run setup
 *   npm run setup -- --skip-install
 *   npm run setup -- --skip-build
 *   npm run setup -- --yes
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import { logger, setupLogger as log, COLORS } from './lib/logger';
import { setupEnvironmentFiles, validateEnvironmentFiles } from './lib/env-manager';

interface SetupOptions {
  skipInstall: boolean;
  skipBuild: boolean;
  skipTests: boolean;
  yes: boolean;
  verbose: boolean;
}

const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(): SetupOptions {
  const args = process.argv.slice(2);
  return {
    skipInstall: args.includes('--skip-install'),
    skipBuild: args.includes('--skip-build'),
    skipTests: args.includes('--skip-tests') || args.includes('--yes'),
    yes: args.includes('--yes') || args.includes('-y'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };
}

function checkNodeVersion(): boolean {
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);

  if (major < 18) {
    log.error(`Node.js >= 18.0.0 required. Current: ${nodeVersion}`);
    log.info('Download: https://nodejs.org/');
    return false;
  }

  log.success(`Node.js version: ${nodeVersion}`);
  return true;
}

function checkNpmVersion(): boolean {
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
    const major = parseInt(npmVersion.split('.')[0], 10);

    if (major < 9) {
      log.warn(`npm >= 9.0.0 recommended. Current: ${npmVersion}`);
    } else {
      log.success(`npm version: ${npmVersion}`);
    }
    return true;
  } catch {
    log.error('npm not found');
    return false;
  }
}

function installDependencies(verbose: boolean): boolean {
  log.info('Installing dependencies...');

  try {
    const result = spawnSync('npm', ['install'], {
      cwd: ROOT_DIR,
      stdio: verbose ? 'inherit' : 'pipe',
      shell: true
    });

    if (result.status !== 0) {
      if (!verbose && result.stderr) {
        console.error(result.stderr.toString());
      }
      log.error('npm install failed');
      return false;
    }

    log.success('Dependencies installed');
    return true;
  } catch (error) {
    log.error(`Install failed: ${error}`);
    return false;
  }
}

function buildProject(verbose: boolean): boolean {
  log.info('Building packages and apps...');

  try {
    const result = spawnSync('npm', ['run', 'build'], {
      cwd: ROOT_DIR,
      stdio: verbose ? 'inherit' : 'pipe',
      shell: true
    });

    if (result.status !== 0) {
      if (!verbose && result.stderr) {
        console.error(result.stderr.toString());
      }
      log.error('Build failed');
      return false;
    }

    log.success('Build completed');
    return true;
  } catch (error) {
    log.error(`Build failed: ${error}`);
    return false;
  }
}

function validateBuild(): boolean {
  const requiredDirs = [
    'apps/api/dist',
    'apps/cli/dist',
    'apps/web/.next',
    'packages/core/dist',
    'packages/api/dist',
    'packages/ml/dist'
  ];

  const missing: string[] = [];

  for (const dir of requiredDirs) {
    const fullPath = path.join(ROOT_DIR, dir);
    if (!fs.existsSync(fullPath)) {
      missing.push(dir);
    }
  }

  if (missing.length > 0) {
    log.error('Missing build artifacts:');
    for (const dir of missing) {
      log.info(`  - ${dir}`);
    }
    return false;
  }

  log.success('Build artifacts validated');
  return true;
}

function runTypecheck(verbose: boolean): boolean {
  log.info('Running typecheck...');

  try {
    const result = spawnSync('npm', ['run', 'typecheck'], {
      cwd: ROOT_DIR,
      stdio: verbose ? 'inherit' : 'pipe',
      shell: true
    });

    if (result.status !== 0) {
      log.warn('Typecheck had issues (non-blocking)');
      return true; // Non-blocking
    }

    log.success('Typecheck passed');
    return true;
  } catch {
    log.warn('Typecheck skipped');
    return true;
  }
}

function ensureDataDir(): void {
  const dataDir = path.join(ROOT_DIR, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log.success('Created data directory');
  }
}

function printSuccessMessage(): void {
  logger.blank();
  logger.header('Setup Complete!');

  logger.box([
    'Arbitrage Scanner is ready to use.',
    '',
    'Quick Start:',
    '  npm run start:all    Start API + Web dashboard',
    '  npm run dev:all      Start in development mode',
    '  npm run dev          Run CLI in dev mode',
    '',
    'Services:',
    '  API:  http://localhost:3001',
    '  Web:  http://localhost:3000',
    '',
    'For more commands: npm run --list'
  ], 'green');

  logger.blank();
}

async function main(): Promise<void> {
  const options = parseArgs();
  const totalSteps = 6 - (options.skipInstall ? 1 : 0) - (options.skipBuild ? 1 : 0);
  let currentStep = 0;

  logger.header('Arbitrage Scanner Setup');

  // Step 1: Version checks
  currentStep++;
  log.step(currentStep, totalSteps, 'Checking system requirements...');

  if (!checkNodeVersion() || !checkNpmVersion()) {
    process.exit(1);
  }

  // Step 2: Install dependencies
  if (!options.skipInstall) {
    currentStep++;
    log.step(currentStep, totalSteps, 'Installing dependencies...');

    if (!installDependencies(options.verbose)) {
      log.error('Setup failed at dependency installation');
      process.exit(1);
    }
  }

  // Step 3: Environment setup
  currentStep++;
  log.step(currentStep, totalSteps, 'Setting up environment files...');

  const envResult = await setupEnvironmentFiles(ROOT_DIR, {
    interactive: !options.yes,
    overwrite: false
  });

  if (!envResult) {
    log.warn('Some environment files could not be created');
  }

  // Validate env files
  const envValidation = validateEnvironmentFiles(ROOT_DIR);
  if (!envValidation.valid) {
    log.warn('Missing environment files:');
    for (const file of envValidation.missing) {
      log.info(`  - ${file}`);
    }
  }

  // Step 4: Build
  if (!options.skipBuild) {
    currentStep++;
    log.step(currentStep, totalSteps, 'Building project...');

    if (!buildProject(options.verbose)) {
      log.error('Setup failed at build step');
      log.info('Try running: npm run build --verbose');
      process.exit(1);
    }
  }

  // Step 5: Validate build
  currentStep++;
  log.step(currentStep, totalSteps, 'Validating build...');

  if (!options.skipBuild && !validateBuild()) {
    log.error('Build validation failed');
    process.exit(1);
  }

  // Ensure data directory
  ensureDataDir();

  // Step 6: Typecheck (optional)
  if (!options.skipTests) {
    currentStep++;
    log.step(currentStep, totalSteps, 'Running validation...');
    runTypecheck(options.verbose);
  }

  // Success!
  printSuccessMessage();
}

main().catch((error) => {
  log.error(`Setup failed: ${error.message}`);
  process.exit(1);
});
