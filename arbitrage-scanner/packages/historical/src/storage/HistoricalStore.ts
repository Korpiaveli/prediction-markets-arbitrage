import * as fs from 'fs';
import * as path from 'path';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { RealHistoricalSnapshot, RealResolution, StorageIndex, CollectionJob } from '../types.js';

export interface HistoricalStoreConfig {
  basePath: string;
  createIfNotExists?: boolean;
}

const DEFAULT_BASE_PATH = './data/historical';

export class HistoricalStore {
  private basePath: string;
  private snapshotsPath: string;
  private resolutionsPath: string;
  private cachePath: string;
  private jobsPath: string;

  constructor(config: Partial<HistoricalStoreConfig> = {}) {
    this.basePath = config.basePath || DEFAULT_BASE_PATH;
    this.snapshotsPath = path.join(this.basePath, 'snapshots');
    this.resolutionsPath = path.join(this.basePath, 'resolutions');
    this.cachePath = path.join(this.basePath, 'cache');
    this.jobsPath = path.join(this.basePath, 'jobs');

    if (config.createIfNotExists !== false) {
      this.ensureDirectories();
    }
  }

  private ensureDirectories(): void {
    const dirs = [
      this.basePath,
      this.snapshotsPath,
      this.resolutionsPath,
      this.cachePath,
      this.jobsPath
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // ============================================================================
  // Snapshots
  // ============================================================================

  async saveSnapshots(snapshots: RealHistoricalSnapshot[]): Promise<void> {
    const groupedByDate = new Map<string, RealHistoricalSnapshot[]>();

    for (const snapshot of snapshots) {
      const dateKey = format(snapshot.timestamp, 'yyyy-MM-dd');
      const existing = groupedByDate.get(dateKey) || [];
      existing.push(snapshot);
      groupedByDate.set(dateKey, existing);
    }

    for (const [dateKey, dateSnapshots] of groupedByDate) {
      const monthDir = path.join(this.snapshotsPath, format(parseISO(dateKey), 'yyyy-MM'));
      if (!fs.existsSync(monthDir)) {
        fs.mkdirSync(monthDir, { recursive: true });
      }

      const filePath = path.join(monthDir, `${dateKey}.json`);
      let existingSnapshots: RealHistoricalSnapshot[] = [];

      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          existingSnapshots = JSON.parse(content, this.dateReviver);
        } catch (e) {
          console.warn(`[HistoricalStore] Failed to read existing file ${filePath}`);
        }
      }

      const mergedSnapshots = this.mergeSnapshots(existingSnapshots, dateSnapshots);
      fs.writeFileSync(filePath, JSON.stringify(mergedSnapshots, null, 2));
    }
  }

  async getSnapshots(dateRange: { start: Date; end: Date }, marketPairIds?: string[]): Promise<RealHistoricalSnapshot[]> {
    const snapshots: RealHistoricalSnapshot[] = [];
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });

    for (const day of days) {
      const monthDir = path.join(this.snapshotsPath, format(day, 'yyyy-MM'));
      const filePath = path.join(monthDir, `${format(day, 'yyyy-MM-dd')}.json`);

      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          let daySnapshots: RealHistoricalSnapshot[] = JSON.parse(content, this.dateReviver);

          if (marketPairIds && marketPairIds.length > 0) {
            const pairIdSet = new Set(marketPairIds);
            daySnapshots = daySnapshots.filter(s => pairIdSet.has(s.marketPairId));
          }

          daySnapshots = daySnapshots.filter(s =>
            s.timestamp >= dateRange.start && s.timestamp <= dateRange.end
          );

          snapshots.push(...daySnapshots);
        } catch (e) {
          console.warn(`[HistoricalStore] Failed to read file ${filePath}`);
        }
      }
    }

    return snapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async getSnapshotsByPair(marketPairId: string): Promise<RealHistoricalSnapshot[]> {
    const allSnapshots: RealHistoricalSnapshot[] = [];

    if (!fs.existsSync(this.snapshotsPath)) {
      return [];
    }

    const monthDirs = fs.readdirSync(this.snapshotsPath);

    for (const monthDir of monthDirs) {
      const monthPath = path.join(this.snapshotsPath, monthDir);
      if (!fs.statSync(monthPath).isDirectory()) continue;

      const dayFiles = fs.readdirSync(monthPath).filter(f => f.endsWith('.json'));

      for (const dayFile of dayFiles) {
        const filePath = path.join(monthPath, dayFile);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const daySnapshots: RealHistoricalSnapshot[] = JSON.parse(content, this.dateReviver);
          const filtered = daySnapshots.filter(s => s.marketPairId === marketPairId);
          allSnapshots.push(...filtered);
        } catch (e) {
          console.warn(`[HistoricalStore] Failed to read file ${filePath}`);
        }
      }
    }

    return allSnapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // ============================================================================
  // Resolutions
  // ============================================================================

  async saveResolution(resolution: RealResolution): Promise<void> {
    const isPending = resolution.sameOutcome === null;
    const filePath = path.join(this.resolutionsPath, isPending ? 'pending.json' : 'resolved.json');

    let existing: RealResolution[] = [];
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        existing = JSON.parse(content, this.dateReviver);
      } catch (e) {
        console.warn(`[HistoricalStore] Failed to read resolutions file`);
      }
    }

    const index = existing.findIndex(r => r.marketPairId === resolution.marketPairId);
    if (index >= 0) {
      existing[index] = resolution;
    } else {
      existing.push(resolution);
    }

    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));

    if (!isPending) {
      await this.removeFromPending(resolution.marketPairId);
    }
  }

  async saveResolutions(resolutions: RealResolution[]): Promise<void> {
    for (const resolution of resolutions) {
      await this.saveResolution(resolution);
    }
  }

  async getResolutions(marketPairIds?: string[]): Promise<RealResolution[]> {
    const resolutions: RealResolution[] = [];

    for (const filename of ['resolved.json', 'pending.json']) {
      const filePath = path.join(this.resolutionsPath, filename);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          let fileResolutions: RealResolution[] = JSON.parse(content, this.dateReviver);

          if (marketPairIds && marketPairIds.length > 0) {
            const pairIdSet = new Set(marketPairIds);
            fileResolutions = fileResolutions.filter(r => pairIdSet.has(r.marketPairId));
          }

          resolutions.push(...fileResolutions);
        } catch (e) {
          console.warn(`[HistoricalStore] Failed to read resolutions file ${filename}`);
        }
      }
    }

    return resolutions;
  }

  async getResolution(marketPairId: string): Promise<RealResolution | null> {
    const resolutions = await this.getResolutions([marketPairId]);
    return resolutions.length > 0 ? resolutions[0] : null;
  }

  async getPendingResolutions(): Promise<RealResolution[]> {
    const filePath = path.join(this.resolutionsPath, 'pending.json');
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content, this.dateReviver);
    } catch (e) {
      return [];
    }
  }

  private async removeFromPending(marketPairId: string): Promise<void> {
    const filePath = path.join(this.resolutionsPath, 'pending.json');
    if (!fs.existsSync(filePath)) {
      return;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const pending: RealResolution[] = JSON.parse(content, this.dateReviver);
      const filtered = pending.filter(r => r.marketPairId !== marketPairId);
      fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2));
    } catch (e) {
      console.warn(`[HistoricalStore] Failed to remove from pending`);
    }
  }

  // ============================================================================
  // Jobs
  // ============================================================================

  async saveJob(job: CollectionJob): Promise<void> {
    const filePath = path.join(this.jobsPath, `${job.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(job, null, 2));
  }

  async getJob(id: string): Promise<CollectionJob | null> {
    const filePath = path.join(this.jobsPath, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content, this.dateReviver);
    } catch (e) {
      return null;
    }
  }

  async listJobs(): Promise<CollectionJob[]> {
    if (!fs.existsSync(this.jobsPath)) {
      return [];
    }

    const files = fs.readdirSync(this.jobsPath).filter(f => f.endsWith('.json'));
    const jobs: CollectionJob[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.jobsPath, file), 'utf-8');
        jobs.push(JSON.parse(content, this.dateReviver));
      } catch (e) {
        console.warn(`[HistoricalStore] Failed to read job file ${file}`);
      }
    }

    return jobs.sort((a, b) =>
      (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0)
    );
  }

  // ============================================================================
  // Index & Stats
  // ============================================================================

  async buildIndex(): Promise<StorageIndex> {
    const marketPairs = new Set<string>();
    let earliest: Date | null = null;
    let latest: Date | null = null;
    let snapshotCount = 0;

    if (fs.existsSync(this.snapshotsPath)) {
      const monthDirs = fs.readdirSync(this.snapshotsPath);

      for (const monthDir of monthDirs) {
        const monthPath = path.join(this.snapshotsPath, monthDir);
        if (!fs.statSync(monthPath).isDirectory()) continue;

        const dayFiles = fs.readdirSync(monthPath).filter(f => f.endsWith('.json'));

        for (const dayFile of dayFiles) {
          const filePath = path.join(monthPath, dayFile);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const snapshots: RealHistoricalSnapshot[] = JSON.parse(content, this.dateReviver);

            for (const s of snapshots) {
              marketPairs.add(s.marketPairId);
              snapshotCount++;

              if (!earliest || s.timestamp < earliest) {
                earliest = s.timestamp;
              }
              if (!latest || s.timestamp > latest) {
                latest = s.timestamp;
              }
            }
          } catch (e) {
            console.warn(`[HistoricalStore] Failed to read file ${filePath}`);
          }
        }
      }
    }

    const resolutions = await this.getResolutions();

    return {
      marketPairs: Array.from(marketPairs),
      dateRange: {
        earliest: earliest || new Date(),
        latest: latest || new Date()
      },
      snapshotCount,
      resolutionCount: resolutions.length,
      lastUpdated: new Date()
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private mergeSnapshots(
    existing: RealHistoricalSnapshot[],
    newSnapshots: RealHistoricalSnapshot[]
  ): RealHistoricalSnapshot[] {
    const merged = new Map<string, RealHistoricalSnapshot>();

    for (const s of existing) {
      const key = `${s.marketPairId}_${s.timestamp.getTime()}`;
      merged.set(key, s);
    }

    for (const s of newSnapshots) {
      const key = `${s.marketPairId}_${s.timestamp.getTime()}`;
      merged.set(key, s);
    }

    return Array.from(merged.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private dateReviver(_key: string, value: any): any {
    if (typeof value === 'string') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      if (dateRegex.test(value)) {
        return new Date(value);
      }
    }
    return value;
  }

  getBasePath(): string {
    return this.basePath;
  }
}

export function createHistoricalStore(config?: Partial<HistoricalStoreConfig>): HistoricalStore {
  return new HistoricalStore(config);
}
