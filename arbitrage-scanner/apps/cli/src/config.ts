/**
 * Configuration Management and Validation
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

export interface ScannerConfig {
  exchanges: {
    kalshi: ExchangeConfig;
    polymarket: ExchangeConfig;
  };
  scanner: {
    scanInterval: number;
    minProfitPercent: number;
    maxConcurrent: number;
  };
  storage: {
    dataDir: string;
    prettyPrint: boolean;
  };
  features: {
    enableResolutionAnalysis: boolean;
    enableLiquidityAnalysis: boolean;
    enableMLMatching: boolean;
  };
  alerts?: {
    discord?: { webhookUrl: string; minProfit: number };
    telegram?: { botToken: string; chatId: string; minProfit: number };
  };
}

export interface ExchangeConfig {
  enabled: boolean;
  apiKey?: string;
  apiSecret?: string;
  testMode: boolean;
  rateLimit: {
    maxRequests: number;
    perMilliseconds: number;
  };
}

export class ConfigManager {
  private config: ScannerConfig | null = null;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || join(process.cwd(), 'config', 'config.json');
  }

  /**
   * Load and validate configuration
   */
  load(): ScannerConfig {
    if (this.config) {
      return this.config;
    }

    if (!existsSync(this.configPath)) {
      console.log(chalk.yellow(`⚠️  Config file not found: ${this.configPath}`));
      console.log(chalk.yellow('   Using default configuration'));
      this.config = this.getDefaultConfig();
      return this.config;
    }

    try {
      const raw = readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw);

      this.config = this.validateAndMerge(parsed);
      console.log(chalk.green(`✓ Configuration loaded from ${this.configPath}`));

      return this.config;
    } catch (error) {
      console.error(chalk.red(`✗ Failed to load config: ${error}`));
      console.log(chalk.yellow('   Using default configuration'));
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  /**
   * Validate configuration and merge with defaults
   */
  private validateAndMerge(config: Partial<ScannerConfig>): ScannerConfig {
    const defaults = this.getDefaultConfig();
    const errors: string[] = [];

    // Validate scanner settings
    if (config.scanner) {
      if (config.scanner.scanInterval && config.scanner.scanInterval < 1000) {
        errors.push('scanner.scanInterval must be >= 1000ms');
      }
      if (config.scanner.minProfitPercent !== undefined &&
          (config.scanner.minProfitPercent < 0 || config.scanner.minProfitPercent > 100)) {
        errors.push('scanner.minProfitPercent must be between 0 and 100');
      }
      if (config.scanner.maxConcurrent && config.scanner.maxConcurrent < 1) {
        errors.push('scanner.maxConcurrent must be >= 1');
      }
    }

    // Validate exchange rate limits
    if (config.exchanges?.kalshi?.rateLimit) {
      this.validateRateLimit(config.exchanges.kalshi.rateLimit, 'exchanges.kalshi', errors);
    }
    if (config.exchanges?.polymarket?.rateLimit) {
      this.validateRateLimit(config.exchanges.polymarket.rateLimit, 'exchanges.polymarket', errors);
    }

    // Validate alert configs
    if (config.alerts?.discord?.webhookUrl) {
      if (!config.alerts.discord.webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        errors.push('Invalid Discord webhook URL');
      }
    }

    if (config.alerts?.telegram) {
      if (!config.alerts.telegram.botToken || !config.alerts.telegram.chatId) {
        errors.push('Telegram requires both botToken and chatId');
      }
    }

    if (errors.length > 0) {
      console.error(chalk.red('\n✗ Configuration validation errors:'));
      errors.forEach(err => console.error(chalk.red(`  - ${err}`)));
      throw new Error('Invalid configuration');
    }

    // Merge with defaults
    return {
      exchanges: {
        kalshi: { ...defaults.exchanges.kalshi, ...config.exchanges?.kalshi },
        polymarket: { ...defaults.exchanges.polymarket, ...config.exchanges?.polymarket }
      },
      scanner: { ...defaults.scanner, ...config.scanner },
      storage: { ...defaults.storage, ...config.storage },
      features: { ...defaults.features, ...config.features },
      alerts: config.alerts
    };
  }

  private validateRateLimit(
    rateLimit: { maxRequests?: number; perMilliseconds?: number },
    path: string,
    errors: string[]
  ) {
    if (rateLimit.maxRequests && rateLimit.maxRequests < 1) {
      errors.push(`${path}.rateLimit.maxRequests must be >= 1`);
    }
    if (rateLimit.perMilliseconds && rateLimit.perMilliseconds < 100) {
      errors.push(`${path}.rateLimit.perMilliseconds must be >= 100`);
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): ScannerConfig {
    return {
      exchanges: {
        kalshi: {
          enabled: true,
          testMode: false,
          rateLimit: {
            maxRequests: 10,
            perMilliseconds: 1000
          }
        },
        polymarket: {
          enabled: true,
          testMode: false,
          rateLimit: {
            maxRequests: 10,
            perMilliseconds: 1000
          }
        }
      },
      scanner: {
        scanInterval: 5000,
        minProfitPercent: 0.5,
        maxConcurrent: 10
      },
      storage: {
        dataDir: './data',
        prettyPrint: true
      },
      features: {
        enableResolutionAnalysis: true,
        enableLiquidityAnalysis: true,
        enableMLMatching: true
      }
    };
  }

  /**
   * Get loaded configuration
   */
  get(): ScannerConfig {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  /**
   * Check if API keys are configured
   */
  hasApiKeys(): boolean {
    if (!this.config) this.load();

    return !!(
      (this.config!.exchanges.kalshi.apiKey && this.config!.exchanges.kalshi.apiSecret) ||
      (this.config!.exchanges.polymarket.apiKey && this.config!.exchanges.polymarket.apiSecret)
    );
  }

  /**
   * Display configuration summary
   */
  display() {
    if (!this.config) this.load();

    console.log(chalk.cyan('\n═══════════════════════════════════════'));
    console.log(chalk.cyan.bold('      CONFIGURATION SUMMARY          '));
    console.log(chalk.cyan('═══════════════════════════════════════\n'));

    console.log(chalk.white('Exchanges:'));
    console.log(`  Kalshi:      ${this.config!.exchanges.kalshi.enabled ? chalk.green('✓ Enabled') : chalk.red('✗ Disabled')}`);
    console.log(`  Polymarket:  ${this.config!.exchanges.polymarket.enabled ? chalk.green('✓ Enabled') : chalk.red('✗ Disabled')}`);

    console.log(chalk.white('\nScanner:'));
    console.log(`  Scan Interval:    ${this.config!.scanner.scanInterval}ms`);
    console.log(`  Min Profit:       ${this.config!.scanner.minProfitPercent}%`);
    console.log(`  Max Concurrent:   ${this.config!.scanner.maxConcurrent}`);

    console.log(chalk.white('\nFeatures:'));
    console.log(`  Resolution Analysis: ${this.config!.features.enableResolutionAnalysis ? chalk.green('✓') : chalk.red('✗')}`);
    console.log(`  Liquidity Analysis:  ${this.config!.features.enableLiquidityAnalysis ? chalk.green('✓') : chalk.red('✗')}`);
    console.log(`  ML Matching:         ${this.config!.features.enableMLMatching ? chalk.green('✓') : chalk.red('✗')}`);

    if (this.config!.alerts) {
      console.log(chalk.white('\nAlerts:'));
      if (this.config!.alerts.discord) {
        console.log(`  Discord:   ${chalk.green('✓ Configured')}`);
      }
      if (this.config!.alerts.telegram) {
        console.log(`  Telegram:  ${chalk.green('✓ Configured')}`);
      }
    }

    console.log('');
  }
}
