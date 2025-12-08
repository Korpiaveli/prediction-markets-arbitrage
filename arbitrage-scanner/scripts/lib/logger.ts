/**
 * Unified Logger for Setup & Orchestration Scripts
 *
 * Provides colored, prefixed logging for multi-service management.
 */

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

interface LoggerOptions {
  prefix?: string;
  color?: keyof typeof COLORS;
  showTimestamp?: boolean;
}

class Logger {
  private prefix: string;
  private color: string;
  private showTimestamp: boolean;
  private debugEnabled: boolean;

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix || '';
    this.color = COLORS[options.color || 'white'];
    this.showTimestamp = options.showTimestamp ?? false;
    this.debugEnabled = process.env.DEBUG === 'true' || process.argv.includes('--verbose');
  }

  private formatPrefix(): string {
    const parts: string[] = [];

    if (this.showTimestamp) {
      const time = new Date().toLocaleTimeString('en-US', { hour12: false });
      parts.push(`${COLORS.gray}${time}${COLORS.reset}`);
    }

    if (this.prefix) {
      parts.push(`${this.color}${COLORS.bold}[${this.prefix}]${COLORS.reset}`);
    }

    return parts.length > 0 ? parts.join(' ') + ' ' : '';
  }

  info(message: string, ...args: unknown[]): void {
    console.log(`${this.formatPrefix()}${message}`, ...args);
  }

  success(message: string, ...args: unknown[]): void {
    console.log(`${this.formatPrefix()}${COLORS.green}✓${COLORS.reset} ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`${this.formatPrefix()}${COLORS.yellow}⚠${COLORS.reset} ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`${this.formatPrefix()}${COLORS.red}✗${COLORS.reset} ${message}`, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.debugEnabled) {
      console.log(`${this.formatPrefix()}${COLORS.gray}[debug]${COLORS.reset} ${message}`, ...args);
    }
  }

  step(stepNum: number, total: number, message: string): void {
    const progress = `${COLORS.cyan}[${stepNum}/${total}]${COLORS.reset}`;
    console.log(`${this.formatPrefix()}${progress} ${message}`);
  }

  blank(): void {
    console.log('');
  }

  divider(char: string = '─', length: number = 50): void {
    console.log(`${COLORS.gray}${char.repeat(length)}${COLORS.reset}`);
  }

  header(title: string): void {
    this.blank();
    this.divider('═');
    console.log(`${COLORS.bold}${COLORS.cyan}  ${title}${COLORS.reset}`);
    this.divider('═');
    this.blank();
  }

  box(lines: string[], color: keyof typeof COLORS = 'cyan'): void {
    const maxLength = Math.max(...lines.map(l => l.length));
    const c = COLORS[color];

    console.log(`${c}┌${'─'.repeat(maxLength + 2)}┐${COLORS.reset}`);
    for (const line of lines) {
      console.log(`${c}│${COLORS.reset} ${line.padEnd(maxLength)} ${c}│${COLORS.reset}`);
    }
    console.log(`${c}└${'─'.repeat(maxLength + 2)}┘${COLORS.reset}`);
  }

  table(rows: [string, string][]): void {
    const maxKeyLength = Math.max(...rows.map(([k]) => k.length));
    for (const [key, value] of rows) {
      console.log(`  ${COLORS.gray}${key.padEnd(maxKeyLength)}${COLORS.reset}  ${value}`);
    }
  }
}

// Pre-configured loggers for different services
export const logger = new Logger({ showTimestamp: false });
export const setupLogger = new Logger({ prefix: 'SETUP', color: 'magenta', showTimestamp: true });
export const apiLogger = new Logger({ prefix: 'API', color: 'blue', showTimestamp: true });
export const webLogger = new Logger({ prefix: 'WEB', color: 'green', showTimestamp: true });
export const scannerLogger = new Logger({ prefix: 'SCAN', color: 'yellow', showTimestamp: true });

export { Logger, COLORS };
export type { LoggerOptions, LogLevel };
