import { ChromaClient, Collection } from 'chromadb';
import { Market, PositionType, ExchangeName, EventType } from '@arb/core';

export interface SimilarMarket {
  market: Market;
  similarity: number;
  distance: number;
}

export interface VectorFilters {
  positionType?: PositionType;
  eventType?: EventType;
  exchange?: ExchangeName;
  year?: number;
  minYear?: number;
  maxYear?: number;
}

export interface ChromaVectorStoreConfig {
  host?: string;
  port?: number;
  collectionName?: string;
}

export class ChromaVectorStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private readonly collectionName: string;
  private initialized = false;

  constructor(config: ChromaVectorStoreConfig = {}) {
    this.collectionName = config.collectionName ?? 'market_embeddings';
    this.client = new ChromaClient({
      host: config.host ?? 'localhost',
      port: config.port ?? 8000
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { 'hnsw:space': 'cosine' }
      });
      this.initialized = true;
      console.log(`[ChromaVectorStore] Initialized collection: ${this.collectionName}`);
    } catch (error) {
      console.error('[ChromaVectorStore] Failed to initialize:', error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.initialized && this.collection !== null;
  }

  async upsertMarket(market: Market, embedding: number[]): Promise<void> {
    if (!this.collection) {
      throw new Error('ChromaVectorStore not initialized');
    }

    const metadata: Record<string, string | number | boolean> = {
      exchange: market.exchange,
      title: market.title.substring(0, 500),
      active: market.active
    };

    if (market.positionType) metadata.positionType = market.positionType;
    if (market.eventType) metadata.eventType = market.eventType;
    if (market.year) metadata.year = market.year;
    if (market.party) metadata.party = market.party;
    if (market.primaryCategory) metadata.category = market.primaryCategory;

    await this.collection.upsert({
      ids: [market.id],
      embeddings: [embedding],
      metadatas: [metadata],
      documents: [`${market.title} ${market.description || ''}`]
    });
  }

  async upsertMarkets(markets: Market[], embeddings: number[][]): Promise<void> {
    if (!this.collection) {
      throw new Error('ChromaVectorStore not initialized');
    }

    if (markets.length !== embeddings.length) {
      throw new Error('Markets and embeddings arrays must have same length');
    }

    const ids = markets.map(m => m.id);
    const metadatas = markets.map(market => {
      const metadata: Record<string, string | number | boolean> = {
        exchange: market.exchange,
        title: market.title.substring(0, 500),
        active: market.active
      };

      if (market.positionType) metadata.positionType = market.positionType;
      if (market.eventType) metadata.eventType = market.eventType;
      if (market.year) metadata.year = market.year;
      if (market.party) metadata.party = market.party;
      if (market.primaryCategory) metadata.category = market.primaryCategory;

      return metadata;
    });
    const documents = markets.map(m => `${m.title} ${m.description || ''}`);

    const batchSize = 100;
    for (let i = 0; i < markets.length; i += batchSize) {
      const endIdx = Math.min(i + batchSize, markets.length);
      await this.collection.upsert({
        ids: ids.slice(i, endIdx),
        embeddings: embeddings.slice(i, endIdx),
        metadatas: metadatas.slice(i, endIdx),
        documents: documents.slice(i, endIdx)
      });
    }
  }

  async findSimilar(
    embedding: number[],
    nResults: number = 10,
    filters?: VectorFilters
  ): Promise<SimilarMarket[]> {
    if (!this.collection) {
      throw new Error('ChromaVectorStore not initialized');
    }

    const whereClause = this.buildWhereClause(filters);

    const results = await this.collection.query({
      queryEmbeddings: [embedding],
      nResults,
      where: whereClause || undefined
    });

    if (!results.ids || results.ids.length === 0 || !results.ids[0]) {
      return [];
    }

    const similarMarkets: SimilarMarket[] = [];
    const ids = results.ids[0];
    const distances = results.distances?.[0] ?? [];
    const metadatas = results.metadatas?.[0] ?? [];
    const documents = results.documents?.[0] ?? [];

    for (let i = 0; i < ids.length; i++) {
      const metadata = metadatas[i] as Record<string, any> || {};
      const distance = distances[i] ?? 1;
      const similarity = 1 - distance;

      const market: Market = {
        id: ids[i],
        exchangeId: ids[i],
        exchange: (metadata.exchange as ExchangeName) || 'KALSHI',
        title: (metadata.title as string) || documents[i] || '',
        description: documents[i] || '',
        active: metadata.active as boolean ?? true,
        positionType: metadata.positionType as PositionType,
        eventType: metadata.eventType as EventType,
        year: metadata.year as number,
        party: metadata.party as any
      };

      similarMarkets.push({ market, similarity, distance });
    }

    return similarMarkets;
  }

  async getSimilarMarkets(
    marketId: string,
    nResults: number = 10,
    samePositionOnly: boolean = true
  ): Promise<SimilarMarket[]> {
    if (!this.collection) {
      throw new Error('ChromaVectorStore not initialized');
    }

    const existingResult = await this.collection.get({
      ids: [marketId],
      include: ['embeddings', 'metadatas']
    });

    if (!existingResult.embeddings || existingResult.embeddings.length === 0) {
      return [];
    }

    const embedding = existingResult.embeddings[0] as number[];
    const metadata = existingResult.metadatas?.[0] as Record<string, any> || {};

    let filters: VectorFilters | undefined;
    if (samePositionOnly && metadata.positionType) {
      filters = { positionType: metadata.positionType as PositionType };
    }

    const results = await this.findSimilar(embedding, nResults + 1, filters);
    return results.filter(r => r.market.id !== marketId).slice(0, nResults);
  }

  async deleteMarket(marketId: string): Promise<void> {
    if (!this.collection) {
      throw new Error('ChromaVectorStore not initialized');
    }

    await this.collection.delete({ ids: [marketId] });
  }

  async deleteMarkets(marketIds: string[]): Promise<void> {
    if (!this.collection) {
      throw new Error('ChromaVectorStore not initialized');
    }

    await this.collection.delete({ ids: marketIds });
  }

  async getCount(): Promise<number> {
    if (!this.collection) {
      throw new Error('ChromaVectorStore not initialized');
    }

    return await this.collection.count();
  }

  async clear(): Promise<void> {
    if (!this.collection) {
      throw new Error('ChromaVectorStore not initialized');
    }

    await this.client.deleteCollection({ name: this.collectionName });
    this.collection = await this.client.getOrCreateCollection({
      name: this.collectionName,
      metadata: { 'hnsw:space': 'cosine' }
    });
  }

  private buildWhereClause(filters?: VectorFilters): Record<string, any> | null {
    if (!filters) return null;

    const conditions: Array<Record<string, any>> = [];

    if (filters.positionType) {
      conditions.push({ positionType: { $eq: filters.positionType } });
    }

    if (filters.eventType) {
      conditions.push({ eventType: { $eq: filters.eventType } });
    }

    if (filters.exchange) {
      conditions.push({ exchange: { $eq: filters.exchange } });
    }

    if (filters.year) {
      conditions.push({ year: { $eq: filters.year } });
    }

    if (filters.minYear) {
      conditions.push({ year: { $gte: filters.minYear } });
    }

    if (filters.maxYear) {
      conditions.push({ year: { $lte: filters.maxYear } });
    }

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
  }
}

let vectorStoreInstance: ChromaVectorStore | null = null;

export function getVectorStore(config?: ChromaVectorStoreConfig): ChromaVectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new ChromaVectorStore(config);
  }
  return vectorStoreInstance;
}

export function resetVectorStore(): void {
  vectorStoreInstance = null;
}
