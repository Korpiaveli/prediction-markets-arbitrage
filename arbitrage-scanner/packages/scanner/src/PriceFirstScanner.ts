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

    if (this.statesConflict(m1.title, m2.title)) {
      return false;
    }

    if (this.districtsConflict(m1.title, m2.title)) {
      return false;
    }

    if (this.specificVsAggregateConflict(m1.title, m2.title)) {
      return false;
    }

    if (this.eventTypeConflict(m1.title, m2.title)) {
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

    if (this.questionTypeConflict(m1.title, m2.title)) {
      return false;
    }

    return true;
  }

  /**
   * Detects question-type mismatches:
   * - COUNT: "20 times", "how many", "number of"
   * - THRESHOLD: "above 4.5%", "at least X", "more than Y"
   * - SINGLE_EVENT: "by June 2026", "at meeting", "will X happen"
   * - CUMULATIVE: "total X in 2025", "throughout the year"
   */
  private questionTypeConflict(title1: string, title2: string): boolean {
    const t1Type = this.detectQuestionType(title1);
    const t2Type = this.detectQuestionType(title2);

    // If both have detected types and they differ, it's a conflict
    if (t1Type && t2Type && t1Type !== t2Type) {
      return true;
    }

    return false;
  }

  private detectQuestionType(title: string): string | null {
    const lower = title.toLowerCase();

    // COUNT patterns: "X times", "how many times", "number of [events]"
    if (/\d+\s*times\b/i.test(title) ||
        /how\s+many\s+times/i.test(lower) ||
        /number\s+of\s+(?:rate\s+)?cuts/i.test(lower) ||
        /\d+\s+(?:rate\s+)?cuts?\b/i.test(title)) {
      return 'COUNT';
    }

    // THRESHOLD patterns: "above X%", "at least X", "more/fewer than Y"
    if (/(?:above|below|over|under)\s+[\d.]+%?/i.test(lower) ||
        /(?:at\s+least|no\s+more\s+than|no\s+fewer\s+than)\s+\d+/i.test(lower) ||
        /(?:more|fewer|less)\s+than\s+\d+/i.test(lower) ||
        /\d+%?\s+or\s+(?:more|higher|lower|less)/i.test(lower)) {
      return 'THRESHOLD';
    }

    // SINGLE_EVENT patterns: "by [date]", "at [meeting]", specific event occurrence
    if (/\bby\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2}|end\s+of)/i.test(lower) ||
        /\bat\s+(?:the\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|next|fomc|meeting)/i.test(lower) ||
        /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}\s+meeting/i.test(lower) ||
        /will\s+(?:the\s+)?fed\s+cut.*\bby\b/i.test(lower) ||
        /next\s+(?:rate\s+)?(?:cut|hike|decision)/i.test(lower)) {
      return 'SINGLE_EVENT';
    }

    // CUMULATIVE patterns: "total in 2025", "throughout", "during 2025"
    if (/total\s+(?:\w+\s+)?(?:in|for|during)\s+20\d{2}/i.test(lower) ||
        /throughout\s+20\d{2}/i.test(lower) ||
        /in\s+20\d{2}\s*\?/i.test(lower) && /how\s+many/i.test(lower)) {
      return 'CUMULATIVE';
    }

    return null;
  }

  private readonly US_STATES: Record<string, string> = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
    'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
    'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
    'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
    'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
    'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
    'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
    'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
  };

  private extractStates(title: string): string[] {
    const states: string[] = [];
    const lower = title.toLowerCase();

    for (const [name, abbr] of Object.entries(this.US_STATES)) {
      if (lower.includes(name)) states.push(abbr);
    }

    const abbrPattern = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)(?:-\d+)?\b/g;
    const matches = title.match(abbrPattern);
    if (matches) {
      for (const m of matches) {
        const abbr = m.replace(/-\d+$/, '');
        if (!states.includes(abbr)) states.push(abbr);
      }
    }

    return states;
  }

  private statesConflict(title1: string, title2: string): boolean {
    const states1 = this.extractStates(title1);
    const states2 = this.extractStates(title2);

    if (states1.length > 0 && states2.length > 0) {
      const overlap = states1.some(s => states2.includes(s));
      if (!overlap) return true;
    }

    return false;
  }

  private extractDistrict(title: string): string | null {
    const match = title.match(/\b([A-Z]{2})-(\d{1,2})\b/);
    return match ? match[0] : null;
  }

  private districtsConflict(title1: string, title2: string): boolean {
    const d1 = this.extractDistrict(title1);
    const d2 = this.extractDistrict(title2);

    if (d1 && d2 && d1 !== d2) {
      return true;
    }

    return false;
  }

  private specificVsAggregateConflict(title1: string, title2: string): boolean {
    const isSpecificRace = (t: string): boolean => {
      return /\b[A-Z]{2}-\d{1,2}\b/.test(t) ||
             /\brace\s+(?:in|for)\b/i.test(t) ||
             /gubernatorial/i.test(t) ||
             /senate\s+(?:race|seat)\s+in/i.test(t);
    };

    const isAggregate = (t: string): boolean => {
      return /which\s+party\s+will\s+win\s+the\s+house/i.test(t) ||
             /win\s+the\s+senate\b(?!\s+race|\s+seat)/i.test(t) ||
             /control\s+of\s+(?:the\s+)?(?:house|senate)/i.test(t);
    };

    const t1Specific = isSpecificRace(title1);
    const t2Specific = isSpecificRace(title2);
    const t1Agg = isAggregate(title1);
    const t2Agg = isAggregate(title2);

    if ((t1Specific && t2Agg) || (t1Agg && t2Specific)) {
      return true;
    }

    return false;
  }

  private eventTypeConflict(title1: string, title2: string): boolean {
    const isOccurrence = (t: string): boolean => {
      return /will\s+(?:the\s+)?.*\s+(?:occur|happen|take\s+place)/i.test(t) ||
             /(?:occur|happen)\s*\?/i.test(t);
    };

    const isWinner = (t: string): boolean => {
      return /(?:who|which)\s+.*\s+(?:win|winner|elected)/i.test(t) ||
             /winner\s*[?:]/i.test(t) ||
             /will\s+.*\s+(?:win|be\s+elected)/i.test(t);
    };

    const isRunning = (t: string): boolean => {
      return /will\s+.*\s+run\b/i.test(t) ||
             /who\s+will\s+run/i.test(t) ||
             /running\s+for/i.test(t);
    };

    const isNominee = (t: string): boolean => {
      return /nominee\s*[?:]/i.test(t) ||
             /who\s+will\s+.*\s+nominate/i.test(t) ||
             /nomination\s+winner/i.test(t);
    };

    const t1Occur = isOccurrence(title1);
    const t2Occur = isOccurrence(title2);
    const t1Win = isWinner(title1);
    const t2Win = isWinner(title2);
    const t1Run = isRunning(title1);
    const t2Run = isRunning(title2);
    const t1Nom = isNominee(title1);
    const t2Nom = isNominee(title2);

    if ((t1Occur && t2Win) || (t1Win && t2Occur)) {
      return true;
    }

    if ((t1Run && t2Nom) || (t1Nom && t2Run)) {
      return true;
    }

    if ((t1Run && t2Win) || (t1Win && t2Run)) {
      return true;
    }

    return false;
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
