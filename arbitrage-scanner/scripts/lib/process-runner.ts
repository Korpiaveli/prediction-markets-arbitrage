/**
 * Process Runner
 *
 * Manages child processes for services with logging, restart, and cleanup.
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import { Logger } from './logger';

export interface ProcessConfig {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
  onExit?: (code: number | null) => void;
  restartOnCrash?: boolean;
  maxRestarts?: number;
  restartDelayMs?: number;
}

export interface ManagedProcess {
  name: string;
  process: ChildProcess | null;
  pid: number | null;
  running: boolean;
  restartCount: number;
  startedAt: Date | null;
}

export class ProcessRunner extends EventEmitter {
  private processes: Map<string, ManagedProcess> = new Map();
  private configs: Map<string, ProcessConfig> = new Map();
  private shuttingDown: boolean = false;

  async start(config: ProcessConfig): Promise<ManagedProcess> {
    const { name, command, args, cwd, env, logger } = config;

    // Store config for restarts
    this.configs.set(name, config);

    // Check if already running
    const existing = this.processes.get(name);
    if (existing?.running) {
      logger.warn(`${name} is already running`);
      return existing;
    }

    logger.info(`Starting ${name}...`);

    const spawnOptions: SpawnOptions = {
      cwd,
      env: { ...process.env, ...env },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    };

    const proc = spawn(command, args, spawnOptions);

    const managed: ManagedProcess = {
      name,
      process: proc,
      pid: proc.pid ?? null,
      running: true,
      restartCount: existing?.restartCount ?? 0,
      startedAt: new Date()
    };

    this.processes.set(name, managed);

    // Handle stdout
    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          logger.info(line);
        }
      }
    });

    // Handle stderr
    proc.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          // Some frameworks log to stderr even for non-errors
          if (line.includes('error') || line.includes('Error') || line.includes('ERROR')) {
            logger.error(line);
          } else {
            logger.warn(line);
          }
        }
      }
    });

    // Handle exit
    proc.on('exit', (code, signal) => {
      managed.running = false;
      managed.process = null;

      if (this.shuttingDown) {
        logger.info(`${name} stopped`);
        return;
      }

      if (code !== 0 && code !== null) {
        logger.error(`${name} exited with code ${code}`);
      } else if (signal) {
        logger.warn(`${name} killed by signal ${signal}`);
      }

      // Handle restart
      if (
        config.restartOnCrash &&
        !this.shuttingDown &&
        managed.restartCount < (config.maxRestarts ?? 3)
      ) {
        managed.restartCount++;
        const delay = config.restartDelayMs ?? 1000;
        logger.info(`Restarting ${name} in ${delay}ms (attempt ${managed.restartCount})...`);

        setTimeout(() => {
          if (!this.shuttingDown) {
            this.start(config);
          }
        }, delay);
      }

      if (config.onExit) {
        config.onExit(code);
      }

      this.emit('exit', { name, code, signal });
    });

    proc.on('error', (error) => {
      logger.error(`${name} error: ${error.message}`);
      managed.running = false;
      this.emit('error', { name, error });
    });

    return managed;
  }

  async stop(name: string, timeoutMs: number = 5000): Promise<void> {
    const managed = this.processes.get(name);
    if (!managed?.process || !managed.running) {
      return;
    }

    const config = this.configs.get(name);
    const logger = config?.logger;

    return new Promise((resolve) => {
      const proc = managed.process!;

      const timeout = setTimeout(() => {
        logger?.warn(`${name} did not exit gracefully, force killing...`);
        proc.kill('SIGKILL');
        resolve();
      }, timeoutMs);

      proc.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      // Send graceful shutdown signal
      if (process.platform === 'win32') {
        // Windows doesn't have SIGTERM, use taskkill
        spawn('taskkill', ['/pid', proc.pid!.toString(), '/f', '/t'], { shell: true });
      } else {
        proc.kill('SIGTERM');
      }
    });
  }

  async stopAll(timeoutMs: number = 5000): Promise<void> {
    this.shuttingDown = true;

    const stopPromises = Array.from(this.processes.keys()).map((name) =>
      this.stop(name, timeoutMs)
    );

    await Promise.all(stopPromises);
  }

  getProcess(name: string): ManagedProcess | undefined {
    return this.processes.get(name);
  }

  getAllProcesses(): ManagedProcess[] {
    return Array.from(this.processes.values());
  }

  isRunning(name: string): boolean {
    return this.processes.get(name)?.running ?? false;
  }

  getUptime(name: string): number | null {
    const managed = this.processes.get(name);
    if (!managed?.startedAt || !managed.running) {
      return null;
    }
    return Date.now() - managed.startedAt.getTime();
  }
}

export const processRunner = new ProcessRunner();
