/**
 * Environment Manager
 *
 * Handles creation and management of .env files from templates.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { setupLogger as log } from './logger';

interface EnvConfig {
  name: string;
  templatePath: string;
  targetPath: string;
  description: string;
}

const ENV_CONFIGS: EnvConfig[] = [
  {
    name: 'API',
    templatePath: 'templates/.env.api.template',
    targetPath: 'apps/api/.env.local',
    description: 'API Server environment'
  },
  {
    name: 'Web',
    templatePath: 'templates/.env.web.template',
    targetPath: 'apps/web/.env.local',
    description: 'Web Dashboard environment'
  }
];

export async function setupEnvironmentFiles(
  rootDir: string,
  options: { interactive?: boolean; overwrite?: boolean } = {}
): Promise<boolean> {
  const { interactive = false, overwrite = false } = options;
  let allSuccess = true;

  for (const config of ENV_CONFIGS) {
    const templatePath = path.join(rootDir, config.templatePath);
    const targetPath = path.join(rootDir, config.targetPath);

    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      log.error(`Template not found: ${config.templatePath}`);
      allSuccess = false;
      continue;
    }

    // Check if target already exists
    if (fs.existsSync(targetPath) && !overwrite) {
      log.info(`${config.name} environment already exists: ${config.targetPath}`);
      continue;
    }

    try {
      // Ensure target directory exists
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Copy template to target
      let content = fs.readFileSync(templatePath, 'utf-8');

      // If interactive, prompt for values
      if (interactive) {
        content = await promptForEnvValues(content, config.name);
      }

      fs.writeFileSync(targetPath, content, 'utf-8');
      log.success(`Created ${config.name} environment: ${config.targetPath}`);
    } catch (error) {
      log.error(`Failed to create ${config.name} environment: ${error}`);
      allSuccess = false;
    }
  }

  return allSuccess;
}

async function promptForEnvValues(content: string, configName: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  };

  log.blank();
  log.info(`Configure ${configName} environment (press Enter to use defaults):`);

  // Extract environment variables that are commented out (optional)
  const optionalVars = content.match(/^#\s*([A-Z_]+)=$/gm);

  if (optionalVars && optionalVars.length > 0) {
    for (const match of optionalVars) {
      const varName = match.replace(/^#\s*/, '').replace(/=$/, '');

      if (varName.includes('KEY') || varName.includes('SECRET')) {
        const value = await question(`  ${varName} (optional, leave blank to skip): `);
        if (value.trim()) {
          // Uncomment and set the value
          content = content.replace(
            new RegExp(`^#\\s*${varName}=$`, 'm'),
            `${varName}=${value.trim()}`
          );
        }
      }
    }
  }

  rl.close();
  return content;
}

export function validateEnvironmentFiles(rootDir: string): {
  valid: boolean;
  missing: string[];
  existing: string[];
} {
  const missing: string[] = [];
  const existing: string[] = [];

  for (const config of ENV_CONFIGS) {
    const targetPath = path.join(rootDir, config.targetPath);

    if (fs.existsSync(targetPath)) {
      existing.push(config.targetPath);
    } else {
      missing.push(config.targetPath);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    existing
  };
}

export function getEnvValue(rootDir: string, envFile: string, key: string): string | undefined {
  const envPath = path.join(rootDir, envFile);

  if (!fs.existsSync(envPath)) {
    return undefined;
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));

  return match ? match[1].trim() : undefined;
}

export function setEnvValue(rootDir: string, envFile: string, key: string, value: string): boolean {
  const envPath = path.join(rootDir, envFile);

  if (!fs.existsSync(envPath)) {
    return false;
  }

  let content = fs.readFileSync(envPath, 'utf-8');
  const regex = new RegExp(`^${key}=.*$`, 'm');

  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }

  fs.writeFileSync(envPath, content, 'utf-8');
  return true;
}

export { ENV_CONFIGS };
