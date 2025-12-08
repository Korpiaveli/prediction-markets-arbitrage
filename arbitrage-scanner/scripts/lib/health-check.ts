/**
 * Health Check Utilities
 *
 * Functions for checking service health and readiness.
 */

import * as http from 'http';

export interface HealthCheckResult {
  healthy: boolean;
  status?: number;
  message?: string;
  latency?: number;
}

export async function checkHttpHealth(
  url: string,
  timeoutMs: number = 5000
): Promise<HealthCheckResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const urlObj = new URL(url);

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname,
        method: 'GET',
        timeout: timeoutMs
      },
      (res) => {
        const latency = Date.now() - startTime;
        resolve({
          healthy: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          latency
        });
      }
    );

    req.on('error', (error) => {
      resolve({
        healthy: false,
        message: error.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        healthy: false,
        message: 'Request timed out'
      });
    });

    req.end();
  });
}

export async function waitForService(
  url: string,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    onAttempt?: (attempt: number, result: HealthCheckResult) => void;
  } = {}
): Promise<boolean> {
  const { timeoutMs = 30000, intervalMs = 1000, onAttempt } = options;
  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < timeoutMs) {
    attempt++;
    const result = await checkHttpHealth(url, 5000);

    if (onAttempt) {
      onAttempt(attempt, result);
    }

    if (result.healthy) {
      return true;
    }

    await sleep(intervalMs);
  }

  return false;
}

export async function checkAllServices(
  services: { name: string; url: string }[]
): Promise<{ name: string; result: HealthCheckResult }[]> {
  const results: { name: string; result: HealthCheckResult }[] = [];

  for (const service of services) {
    const result = await checkHttpHealth(service.url);
    results.push({ name: service.name, result });
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ServiceStatus {
  name: string;
  running: boolean;
  healthy: boolean;
  url: string;
  pid?: number;
  uptime?: number;
}

export function formatServiceStatus(services: ServiceStatus[]): string {
  const lines: string[] = [];
  const maxNameLen = Math.max(...services.map((s) => s.name.length));

  for (const service of services) {
    const status = service.running
      ? service.healthy
        ? '\x1b[32m● HEALTHY\x1b[0m'
        : '\x1b[33m● UNHEALTHY\x1b[0m'
      : '\x1b[31m○ STOPPED\x1b[0m';

    const name = service.name.padEnd(maxNameLen);
    const url = service.url;
    const pid = service.pid ? `(PID: ${service.pid})` : '';

    lines.push(`  ${name}  ${status}  ${url}  ${pid}`);
  }

  return lines.join('\n');
}
