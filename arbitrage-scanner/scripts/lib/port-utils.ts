/**
 * Port Utilities
 *
 * Functions for checking port availability and finding free ports.
 */

import * as net from 'net';

export async function isPortAvailable(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, host);
  });
}

export async function findAvailablePort(
  startPort: number,
  endPort: number = startPort + 100,
  host: string = '127.0.0.1'
): Promise<number | null> {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  return null;
}

export async function checkRequiredPorts(
  ports: { name: string; port: number }[]
): Promise<{ available: boolean; conflicts: { name: string; port: number }[] }> {
  const conflicts: { name: string; port: number }[] = [];

  for (const { name, port } of ports) {
    const available = await isPortAvailable(port);
    if (!available) {
      conflicts.push({ name, port });
    }
  }

  return {
    available: conflicts.length === 0,
    conflicts
  };
}

export function getProcessUsingPort(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const isWin = process.platform === 'win32';

    const cmd = isWin
      ? `netstat -ano | findstr :${port}`
      : `lsof -i :${port} -t`;

    exec(cmd, (error: Error | null, stdout: string) => {
      if (error || !stdout.trim()) {
        resolve(null);
        return;
      }

      if (isWin) {
        // Parse Windows netstat output
        const lines = stdout.trim().split('\n');
        if (lines.length > 0) {
          const parts = lines[0].trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          resolve(pid);
        } else {
          resolve(null);
        }
      } else {
        // Unix: lsof returns PID directly
        resolve(stdout.trim().split('\n')[0]);
      }
    });
  });
}

export interface PortConfig {
  api: number;
  web: number;
}

export const DEFAULT_PORTS: PortConfig = {
  api: 3001,
  web: 3000
};

export function parsePortOverrides(args: string[]): Partial<PortConfig> {
  const overrides: Partial<PortConfig> = {};

  const apiIndex = args.indexOf('--port-api');
  if (apiIndex !== -1 && args[apiIndex + 1]) {
    const port = parseInt(args[apiIndex + 1], 10);
    if (!isNaN(port)) {
      overrides.api = port;
    }
  }

  const webIndex = args.indexOf('--port-web');
  if (webIndex !== -1 && args[webIndex + 1]) {
    const port = parseInt(args[webIndex + 1], 10);
    if (!isNaN(port)) {
      overrides.web = port;
    }
  }

  return overrides;
}
