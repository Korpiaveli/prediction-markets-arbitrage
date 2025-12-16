import { ExchangeName } from '@arb/core';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface WhitelistEntry {
  exchange1: ExchangeName;
  market1Id: string;
  exchange2: ExchangeName;
  market2Id: string;
  verifiedAt: string;
  verifiedBy: string;
  confidence: number;
  notes?: string;
}

export class ManualWhitelist {
  private entries: Map<string, WhitelistEntry> = new Map();
  private loaded = false;

  private getKey(m1Id: string, m2Id: string): string {
    return [m1Id, m2Id].sort().join('|');
  }

  isWhitelisted(market1Id: string, market2Id: string): boolean {
    return this.entries.has(this.getKey(market1Id, market2Id));
  }

  getEntry(market1Id: string, market2Id: string): WhitelistEntry | undefined {
    return this.entries.get(this.getKey(market1Id, market2Id));
  }

  addEntry(entry: WhitelistEntry): void {
    const key = this.getKey(entry.market1Id, entry.market2Id);
    this.entries.set(key, entry);
  }

  removeEntry(market1Id: string, market2Id: string): boolean {
    return this.entries.delete(this.getKey(market1Id, market2Id));
  }

  getAllEntries(): WhitelistEntry[] {
    return Array.from(this.entries.values());
  }

  getEntryCount(): number {
    return this.entries.size;
  }

  async loadFromFile(filePath: string): Promise<void> {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const entries: WhitelistEntry[] = JSON.parse(data);

      this.entries.clear();
      for (const entry of entries) {
        this.addEntry(entry);
      }

      this.loaded = true;
      console.log(`[ManualWhitelist] Loaded ${entries.length} verified pairs from ${path.basename(filePath)}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`[ManualWhitelist] No whitelist file found at ${filePath}`);
        this.loaded = true;
      } else {
        console.error(`[ManualWhitelist] Error loading whitelist:`, error);
        throw error;
      }
    }
  }

  async saveToFile(filePath: string): Promise<void> {
    const entries = this.getAllEntries();
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(entries, null, 2), 'utf-8');

    console.log(`[ManualWhitelist] Saved ${entries.length} entries to ${path.basename(filePath)}`);
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const manualWhitelist = new ManualWhitelist();
