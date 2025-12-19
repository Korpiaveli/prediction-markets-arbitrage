import {
  Market,
  ExchangeName,
  IExchange,
  FeeStructure
} from '@arb/core';
import { HardBlockerValidator, ManualWhitelist } from '@arb/ml';
import {
  PriceCandidate,
  PriceScreenConfig,
  PriceSignal,
  ArbitrageScanResult,
  ArbitrageOpportunity,
  DEFAULT_PRICE_SCREEN_CONFIG
} from './types.js';

interface ExchangeMarkets {
  exchange: ExchangeName;
  markets: Market[];
}

const DEFAULT_FEES: FeeStructure = {
  kalshiFeePerContract: 0.01,
  kalshiFeePercent: 0.01,
  polymarketFeeRate: 0.02,
  safetyMarginPercent: 0.005
};

export class PriceFirstScanner {
  private validator: HardBlockerValidator;
  private whitelist: ManualWhitelist;
  private fees: FeeStructure;

  constructor(fees: FeeStructure = DEFAULT_FEES) {
    this.validator = new HardBlockerValidator();
    this.whitelist = new ManualWhitelist();
    this.fees = fees;
  }

  async loadWhitelist(filePath: string): Promise<void> {
    await this.whitelist.loadFromFile(filePath);
  }

  async scan(
    exchanges: IExchange[],
    config: Partial<PriceScreenConfig> = {}
  ): Promise<ArbitrageScanResult> {
    const startTime = Date.now();
    const fullConfig = { ...DEFAULT_PRICE_SCREEN_CONFIG, ...config };

    console.log(`[PriceFirstScanner] Starting scan with config:`, {
      maxTotalCost: fullConfig.maxTotalCost,
      minGrossArbitrage: fullConfig.minGrossArbitrage,
      categories: fullConfig.includeCategories
    });

    const marketsByExchange = await this.fetchAllMarkets(exchanges, fullConfig);
    const marketsScanned: Record<ExchangeName, number> = {} as Record<ExchangeName, number>;
    for (const { exchange, markets } of marketsByExchange) {
      marketsScanned[exchange] = markets.length;
    }

    const candidates = this.priceScreen(marketsByExchange, fullConfig);
    console.log(`[PriceFirstScanner] Found ${candidates.length} price-qualified candidates`);

    const validated = this.validateCandidates(candidates);
    console.log(`[PriceFirstScanner] ${validated.length} passed validation`);

    const opportunities = this.calculateOpportunities(validated);
    console.log(`[PriceFirstScanner] ${opportunities.length} final opportunities`);

    const scanTime = Date.now() - startTime;
    console.log(`[PriceFirstScanner] Scan completed in ${scanTime}ms`);

    return {
      candidates,
      validated,
      opportunities,
      scanTime,
      marketsScanned
    };
  }

  private async fetchAllMarkets(
    exchanges: IExchange[],
    config: PriceScreenConfig
  ): Promise<ExchangeMarkets[]> {
    const results = await Promise.all(
      exchanges.map(async (exchange) => {
        try {
          const markets = await exchange.getMarkets({
            categories: config.includeCategories,
            maxMarkets: config.maxMarketsPerExchange
          });

          const withPrices = markets.filter(m => m.priceSnapshot);
          console.log(`[PriceFirstScanner] ${exchange.name}: ${markets.length} markets, ${withPrices.length} with prices`);

          return {
            exchange: exchange.name,
            markets: withPrices
          };
        } catch (error) {
          console.error(`[PriceFirstScanner] Failed to fetch ${exchange.name}:`, error);
          return { exchange: exchange.name, markets: [] };
        }
      })
    );

    return results;
  }

  private priceScreen(
    marketsByExchange: ExchangeMarkets[],
    config: PriceScreenConfig
  ): PriceCandidate[] {
    const candidates: PriceCandidate[] = [];

    for (let i = 0; i < marketsByExchange.length; i++) {
      for (let j = i + 1; j < marketsByExchange.length; j++) {
        const { exchange: exchange1, markets: markets1 } = marketsByExchange[i];
        const { exchange: exchange2, markets: markets2 } = marketsByExchange[j];

        console.log(`[PriceFirstScanner] Screening ${exchange1} (${markets1.length}) vs ${exchange2} (${markets2.length})`);

        for (const m1 of markets1) {
          if (!m1.priceSnapshot) continue;

          for (const m2 of markets2) {
            if (!m2.priceSnapshot) continue;

            const yesNoSignal = this.checkPriceSignal(
              m1.priceSnapshot.yesAsk,
              m2.priceSnapshot.noAsk,
              'YES_NO',
              config
            );

            if (yesNoSignal) {
              candidates.push({
                market1: m1,
                market2: m2,
                exchange1,
                exchange2,
                priceSignal: yesNoSignal
              });
            }

            const noYesSignal = this.checkPriceSignal(
              m1.priceSnapshot.noAsk,
              m2.priceSnapshot.yesAsk,
              'NO_YES',
              config
            );

            if (noYesSignal) {
              candidates.push({
                market1: m1,
                market2: m2,
                exchange1,
                exchange2,
                priceSignal: noYesSignal
              });
            }
          }
        }
      }
    }

    return candidates.sort((a, b) => a.priceSignal.totalCost - b.priceSignal.totalCost);
  }

  private checkPriceSignal(
    price1: number,
    price2: number,
    combo: 'YES_NO' | 'NO_YES',
    config: PriceScreenConfig
  ): PriceSignal | null {
    const totalCost = price1 + price2;
    const grossArbitrage = 1 - totalCost;

    if (totalCost < config.maxTotalCost && grossArbitrage >= config.minGrossArbitrage) {
      return { combo, totalCost, grossArbitrage };
    }

    return null;
  }

  private validateCandidates(candidates: PriceCandidate[]): PriceCandidate[] {
    return candidates.filter(candidate => {
      if (this.whitelist.isWhitelisted(candidate.market1.id, candidate.market2.id)) {
        return true;
      }

      const result = this.validator.validate(candidate.market1, candidate.market2);

      if (result.blocked) {
        return false;
      }

      if (!this.lightSemanticCheck(candidate.market1, candidate.market2)) {
        return false;
      }

      return true;
    });
  }

  private lightSemanticCheck(m1: Market, m2: Market): boolean {
    if (m1.categories && m2.categories) {
      const overlap = m1.categories.some(c => m2.categories!.includes(c));
      if (!overlap) return false;
    }

    if (m1.year && m2.year && Math.abs(m1.year - m2.year) > 1) {
      return false;
    }

    const entities1 = this.extractKeyEntities(m1.title);
    const entities2 = this.extractKeyEntities(m2.title);

    if (entities1.length > 0 && entities2.length > 0) {
      const entityOverlap = entities1.some(e1 =>
        entities2.some(e2 => e1.toLowerCase() === e2.toLowerCase())
      );
      if (!entityOverlap) return false;
    }

    const titleSimilarity = this.calculateTitleSimilarity(m1.title, m2.title);
    if (titleSimilarity < 0.25) {
      return false;
    }

    if (this.candidateNamesConflict(m1, m2)) {
      return false;
    }

    return true;
  }

  private calculateTitleSimilarity(title1: string, title2: string): number {
    const stopWords = new Set([
      'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is',
      'be', 'will', 'by', 'with', 'as', 'from', 'this', 'that', 'what', 'who',
      'which', 'when', 'where', 'how', 'if', 'than', 'then', 'so', 'no', 'not',
      'yes', 'any', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
      'some', 'such', 'only', 'own', 'same', 'too', 'very', 'just', 'can', 'could',
      'may', 'might', 'must', 'shall', 'should', 'would', 'have', 'has', 'had',
      'do', 'does', 'did', 'being', 'been', 'was', 'were', 'are', 'am',
      'his', 'her', 'its', 'their', 'our', 'your', 'my', 'before', 'after'
    ]);

    const tokenize = (text: string): Set<string> => {
      return new Set(
        text.toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 2 && !stopWords.has(w))
      );
    };

    const words1 = tokenize(title1);
    const words2 = tokenize(title2);

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private extractKeyEntities(title: string): string[] {
    const entities: string[] = [];

    const politicians = [
      'trump', 'biden', 'harris', 'vance', 'desantis', 'newsom', 'pence',
      'haley', 'ramaswamy', 'christie', 'kennedy', 'rfk', 'obama', 'clinton',
      'sanders', 'warren', 'buttigieg', 'mcconnell', 'pelosi', 'schumer'
    ];

    const lowerTitle = title.toLowerCase();
    for (const pol of politicians) {
      if (lowerTitle.includes(pol)) {
        entities.push(pol);
      }
    }

    const yearMatch = title.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      entities.push(yearMatch[1]);
    }

    const eventKeywords = [
      'president', 'presidential', 'election', 'nominee', 'nomination',
      'senate', 'house', 'governor', 'congress'
    ];

    for (const kw of eventKeywords) {
      if (lowerTitle.includes(kw)) {
        entities.push(kw);
      }
    }

    return entities;
  }

  private extractCandidateName(title: string): string | null {
    const patterns = [
      /nominate\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s*\([^)]+\))?)\s+as/i,
      /nominee\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /will\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:win|be|become)/i,
      /\?\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/,
      /:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/,
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        let candidate = match[1].trim().toLowerCase();
        candidate = candidate.replace(/\s*\([^)]+\)\s*/g, ' ').trim();
        const skipWords = ['yes', 'no', 'other', 'none', 'republican', 'democratic', 'democrat', 'party', 'trump', 'biden'];
        if (!skipWords.includes(candidate) && !skipWords.includes(candidate.split(/\s+/)[0])) {
          return candidate;
        }
      }
    }

    const colonMatch = title.match(/:\s*([^:?]+?)\s*$/);
    if (colonMatch) {
      const afterColon = colonMatch[1].trim();
      if (afterColon.length >= 3 && afterColon.length <= 30) {
        const words = afterColon.split(/\s+/);
        if (words.length <= 3 && /^[A-Z]/.test(afterColon)) {
          const candidate = afterColon.toLowerCase();
          const skipWords = ['yes', 'no', 'other', 'none', 'republican', 'democratic', 'democrat', 'party', 'more', 'fewer', 'trump', 'biden'];
          if (!skipWords.includes(candidate) && !/^\d/.test(candidate)) {
            return candidate;
          }
        }
      }
    }

    return null;
  }

  private candidateNamesConflict(m1: Market, m2: Market): boolean {
    const c1 = this.extractCandidateName(m1.title);
    const c2 = this.extractCandidateName(m2.title);

    if (c1 && c2) {
      const c1Words = c1.split(/\s+/);
      const c2Words = c2.split(/\s+/);

      const hasOverlap = c1Words.some(w1 =>
        c2Words.some(w2 => w1 === w2 || w1.includes(w2) || w2.includes(w1))
      );

      if (!hasOverlap) {
        return true;
      }
    }

    return false;
  }

  private calculateOpportunities(validated: PriceCandidate[]): ArbitrageOpportunity[] {
    return validated.map((candidate, index) => {
      const { market1, market2, priceSignal, exchange1, exchange2 } = candidate;

      const e1Fee = this.estimateFee(exchange1, priceSignal.combo === 'YES_NO'
        ? market1.priceSnapshot!.yesAsk
        : market1.priceSnapshot!.noAsk);

      const e2Fee = this.estimateFee(exchange2, priceSignal.combo === 'YES_NO'
        ? market2.priceSnapshot!.noAsk
        : market2.priceSnapshot!.yesAsk);

      const totalFees = e1Fee + e2Fee;
      const netProfit = priceSignal.grossArbitrage - totalFees;
      const netProfitPercent = netProfit * 100;
      const grossProfitPercent = priceSignal.grossArbitrage * 100;

      const confidence = this.calculateConfidence(candidate, netProfitPercent);

      return {
        id: `opp-${Date.now()}-${index}`,
        candidate,
        netProfitPercent,
        grossProfitPercent,
        totalCost: priceSignal.totalCost,
        fees: {
          exchange1: e1Fee,
          exchange2: e2Fee,
          total: totalFees
        },
        direction: priceSignal.combo,
        confidence,
        timestamp: new Date()
      };
    }).filter(opp => opp.netProfitPercent > 0)
      .sort((a, b) => b.netProfitPercent - a.netProfitPercent);
  }

  private estimateFee(exchange: ExchangeName, price: number): number {
    switch (exchange) {
      case 'KALSHI':
        return this.fees.kalshiFeePerContract + (price * (this.fees.kalshiFeePercent || 0));
      case 'POLYMARKET':
        return (1 - price) * this.fees.polymarketFeeRate;
      case 'PREDICTIT':
        return (1 - price) * 0.10;
      default:
        return 0.02;
    }
  }

  private calculateConfidence(candidate: PriceCandidate, netProfitPercent: number): number {
    let confidence = 70;

    if (netProfitPercent > 5) confidence -= 20;
    else if (netProfitPercent > 2) confidence += 10;
    else if (netProfitPercent > 0.5) confidence += 20;
    else confidence += 5;

    const m1 = candidate.market1;
    const m2 = candidate.market2;

    if (m1.year && m2.year && m1.year === m2.year) confidence += 10;
    if (m1.positionType && m2.positionType && m1.positionType === m2.positionType) confidence += 10;
    if (m1.eventType && m2.eventType && m1.eventType === m2.eventType) confidence += 10;

    return Math.min(100, Math.max(0, confidence));
  }

  getValidator(): HardBlockerValidator {
    return this.validator;
  }
}
