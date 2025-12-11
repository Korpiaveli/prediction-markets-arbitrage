import { Market, PositionType, EventType } from '@arb/core';
import { KalshiTickerParser } from '../parsers/KalshiTickerParser.js';

export type BlockerSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface HardBlockerResult {
  blocked: boolean;
  reason: string | null;
  severity: BlockerSeverity;
  blocker?: string;
}

interface HardBlocker {
  name: string;
  severity: BlockerSeverity;
  check(market1: Market, market2: Market): HardBlockerResult;
}

class PositionTypeBlocker implements HardBlocker {
  name = 'PositionTypeBlocker';
  severity: BlockerSeverity = 'CRITICAL';
  private tickerParser = new KalshiTickerParser();

  check(market1: Market, market2: Market): HardBlockerResult {
    const pos1 = this.extractPositionType(market1);
    const pos2 = this.extractPositionType(market2);

    if (pos1 && pos2 && pos1 !== pos2) {
      if ((pos1 === 'VICE_PRESIDENT' && pos2 === 'PRESIDENT') ||
          (pos1 === 'PRESIDENT' && pos2 === 'VICE_PRESIDENT')) {
        return {
          blocked: true,
          reason: `Position type mismatch: ${pos1} vs ${pos2}`,
          severity: 'CRITICAL',
          blocker: this.name
        };
      }
    }

    return { blocked: false, reason: null, severity: 'MEDIUM' };
  }

  private extractPositionType(market: Market): PositionType | null {
    if (market.positionType) {
      return market.positionType;
    }

    if (market.exchange === 'KALSHI') {
      const parsed = this.tickerParser.parse(market.id);
      if (parsed.confidence >= 0.7 && parsed.positionType !== 'OTHER') {
        return parsed.positionType;
      }
    }

    return this.extractPositionFromText(market);
  }

  private extractPositionFromText(market: Market): PositionType | null {
    const text = `${market.title} ${market.description || ''}`.toLowerCase();

    const vpPatterns = [
      /vice[- ]?president/,
      /vice[- ]?presidential/,
      /vice[- ]?presidency/,
      /\bvp\b(?![a-z])/,
      /running[- ]?mate/
    ];

    if (vpPatterns.some(p => p.test(text))) {
      return 'VICE_PRESIDENT';
    }

    if (/\bpresident|\bpresidential/.test(text) && !/vice/.test(text)) {
      return 'PRESIDENT';
    }

    if (/\bsenate|\bsenator/.test(text)) {
      return 'SENATE';
    }

    if (/\bhouse\b|\bcongress|\brepresentative/.test(text)) {
      return 'HOUSE';
    }

    if (/\bgovernor/.test(text)) {
      return 'GOVERNOR';
    }

    if (/\bmayor/.test(text)) {
      return 'MAYOR';
    }

    return null;
  }
}

class TemporalYearBlocker implements HardBlocker {
  name = 'TemporalYearBlocker';
  severity: BlockerSeverity = 'HIGH';

  check(market1: Market, market2: Market): HardBlockerResult {
    const year1 = this.extractYear(market1);
    const year2 = this.extractYear(market2);

    if (year1 && year2 && Math.abs(year1 - year2) >= 2) {
      return {
        blocked: true,
        reason: `Year mismatch: ${year1} vs ${year2} (${Math.abs(year1 - year2)} years apart)`,
        severity: 'HIGH',
        blocker: this.name
      };
    }

    return { blocked: false, reason: null, severity: 'MEDIUM' };
  }

  private extractYear(market: Market): number | null {
    if (market.year) return market.year;

    const text = `${market.id} ${market.title} ${market.description || ''}`;
    const yearMatch = text.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      return parseInt(yearMatch[1], 10);
    }

    const shortYearMatch = text.match(/-(\d{2})(?:-|$)/);
    if (shortYearMatch) {
      return 2000 + parseInt(shortYearMatch[1], 10);
    }

    return null;
  }
}

class GeographicBlocker implements HardBlocker {
  name = 'GeographicBlocker';
  severity: BlockerSeverity = 'CRITICAL';

  private readonly countries = [
    'united states', 'honduras', 'mexico', 'canada', 'brazil', 'argentina',
    'united kingdom', 'france', 'germany', 'italy', 'spain', 'poland',
    'ukraine', 'russia', 'china', 'japan', 'india', 'australia',
    'israel', 'iran', 'turkey', 'egypt', 'nigeria', 'south africa'
  ];

  private readonly usIndicators = [
    'white house', 'congress', 'senate', 'house of representatives',
    'supreme court', 'scotus', 'federal reserve', 'us president',
    'american president', 'republican', 'democrat', 'gop', 'dnc', 'rnc'
  ];

  check(market1: Market, market2: Market): HardBlockerResult {
    const geo1 = this.extractGeography(market1);
    const geo2 = this.extractGeography(market2);

    if (geo1.countries.length > 0 && geo2.countries.length > 0) {
      const overlap = geo1.countries.some(c1 =>
        geo2.countries.some(c2 => this.countriesMatch(c1, c2))
      );

      if (!overlap) {
        return {
          blocked: true,
          reason: `Geographic mismatch: ${geo1.countries.join(', ')} vs ${geo2.countries.join(', ')}`,
          severity: 'CRITICAL',
          blocker: this.name
        };
      }
    }

    if (geo1.isUs && geo2.countries.length > 0 && !geo2.countries.some(c => this.isUsCountry(c))) {
      return {
        blocked: true,
        reason: `US market vs non-US: ${geo2.countries.join(', ')}`,
        severity: 'CRITICAL',
        blocker: this.name
      };
    }

    if (geo2.isUs && geo1.countries.length > 0 && !geo1.countries.some(c => this.isUsCountry(c))) {
      return {
        blocked: true,
        reason: `Non-US market vs US: ${geo1.countries.join(', ')}`,
        severity: 'CRITICAL',
        blocker: this.name
      };
    }

    return { blocked: false, reason: null, severity: 'MEDIUM' };
  }

  private extractGeography(market: Market): { countries: string[]; isUs: boolean } {
    const text = `${market.title} ${market.description || ''} ${market.metadata?.rulesPrimary || ''}`.toLowerCase();
    const countries: string[] = [];

    for (const country of this.countries) {
      if (text.includes(country)) {
        countries.push(country);
      }
    }

    if (/\b(usa|u\.s\.a?\.?|u\.s\.)\b/i.test(text)) {
      if (!countries.includes('united states')) {
        countries.push('united states');
      }
    }

    const isUs = this.usIndicators.some(ind => text.includes(ind)) ||
      countries.some(c => this.isUsCountry(c));

    return { countries, isUs };
  }

  private countriesMatch(c1: string, c2: string): boolean {
    if (c1 === c2) return true;
    const usAliases = ['united states', 'usa', 'us', 'america'];
    if (usAliases.includes(c1) && usAliases.includes(c2)) return true;
    const ukAliases = ['united kingdom', 'uk', 'britain'];
    if (ukAliases.includes(c1) && ukAliases.includes(c2)) return true;
    return false;
  }

  private isUsCountry(country: string): boolean {
    return ['united states', 'usa', 'us', 'america'].includes(country.toLowerCase());
  }
}

class OppositeOutcomeBlocker implements HardBlocker {
  name = 'OppositeOutcomeBlocker';
  severity: BlockerSeverity = 'HIGH';

  check(market1: Market, market2: Market): HardBlockerResult {
    const text1 = `${market1.title} ${market1.description || ''}`.toLowerCase();
    const text2 = `${market2.title} ${market2.description || ''}`.toLowerCase();

    const repDemResult = this.checkRepublicanVsDemocrat(text1, text2);
    if (repDemResult.blocked) return repDemResult;

    const yesNoResult = this.checkYesVsNo(text1, text2);
    if (yesNoResult.blocked) return yesNoResult;

    return { blocked: false, reason: null, severity: 'MEDIUM' };
  }

  private checkRepublicanVsDemocrat(text1: string, text2: string): HardBlockerResult {
    const hasRep1 = /\brepublican\b|\bgop\b|\brnc\b/.test(text1);
    const hasDem1 = /\bdemocrat(ic)?\b|\bdnc\b/.test(text1);
    const hasRep2 = /\brepublican\b|\bgop\b|\brnc\b/.test(text2);
    const hasDem2 = /\bdemocrat(ic)?\b|\bdnc\b/.test(text2);

    if ((hasRep1 && !hasDem1 && hasDem2 && !hasRep2) ||
        (hasDem1 && !hasRep1 && hasRep2 && !hasDem2)) {
      return {
        blocked: true,
        reason: `Party mismatch: ${hasRep1 ? 'Republican' : 'Democrat'} vs ${hasRep2 ? 'Republican' : 'Democrat'}`,
        severity: 'HIGH',
        blocker: this.name
      };
    }

    return { blocked: false, reason: null, severity: 'MEDIUM' };
  }

  private checkYesVsNo(text1: string, text2: string): HardBlockerResult {
    const extractOutcome = (title: string): string | null => {
      const colonMatch = title.match(/:\s*([^:]+)$/);
      if (colonMatch) {
        return colonMatch[1].trim().toLowerCase();
      }
      return null;
    };

    const outcome1 = extractOutcome(text1);
    const outcome2 = extractOutcome(text2);

    if (outcome1 && outcome2) {
      const opposites = [
        ['yes', 'no'],
        ['win', 'lose'],
        ['increase', 'decrease'],
        ['above', 'below'],
        ['more', 'less']
      ];

      for (const pair of opposites) {
        if ((pair.includes(outcome1) && pair.includes(outcome2)) && outcome1 !== outcome2) {
          return {
            blocked: true,
            reason: `Opposite outcomes: ${outcome1} vs ${outcome2}`,
            severity: 'HIGH',
            blocker: this.name
          };
        }
      }
    }

    return { blocked: false, reason: null, severity: 'MEDIUM' };
  }
}

class EventTypeBlocker implements HardBlocker {
  name = 'EventTypeBlocker';
  severity: BlockerSeverity = 'HIGH';

  check(market1: Market, market2: Market): HardBlockerResult {
    const event1 = this.extractEventType(market1);
    const event2 = this.extractEventType(market2);

    if (event1 && event2 && event1 !== event2) {
      if ((event1 === 'NOMINEE' && event2 === 'WINNER') ||
          (event1 === 'WINNER' && event2 === 'NOMINEE')) {
        return {
          blocked: true,
          reason: `Event type mismatch: ${event1} vs ${event2}`,
          severity: 'HIGH',
          blocker: this.name
        };
      }
    }

    return { blocked: false, reason: null, severity: 'MEDIUM' };
  }

  private extractEventType(market: Market): EventType | null {
    if (market.eventType) return market.eventType;

    const text = `${market.id} ${market.title} ${market.description || ''}`.toLowerCase();

    if (/\bnomin(ee|ation|ated)\b/.test(text)) return 'NOMINEE';
    if (/\bwin(s|ner|ning)?\b|\belect(ed|ion)?\b/.test(text)) return 'WINNER';
    if (/electoral\s+vote/.test(text)) return 'ELECTORAL_VOTES';
    if (/popular\s+vote/.test(text)) return 'POPULAR_VOTE';
    if (/approval\s+(rating|rate)/.test(text)) return 'APPROVAL_RATING';

    return null;
  }
}

export class HardBlockerValidator {
  private readonly blockers: HardBlocker[] = [
    new PositionTypeBlocker(),
    new GeographicBlocker(),
    new TemporalYearBlocker(),
    new OppositeOutcomeBlocker(),
    new EventTypeBlocker()
  ];

  validate(market1: Market, market2: Market): HardBlockerResult {
    for (const blocker of this.blockers) {
      const result = blocker.check(market1, market2);
      if (result.blocked) {
        return result;
      }
    }

    return {
      blocked: false,
      reason: null,
      severity: 'MEDIUM'
    };
  }

  validateWithDetails(market1: Market, market2: Market): {
    blocked: boolean;
    results: HardBlockerResult[];
    criticalBlocks: string[];
    highBlocks: string[];
  } {
    const results: HardBlockerResult[] = [];
    const criticalBlocks: string[] = [];
    const highBlocks: string[] = [];

    for (const blocker of this.blockers) {
      const result = blocker.check(market1, market2);
      results.push(result);

      if (result.blocked) {
        if (result.severity === 'CRITICAL') {
          criticalBlocks.push(result.reason || blocker.name);
        } else if (result.severity === 'HIGH') {
          highBlocks.push(result.reason || blocker.name);
        }
      }
    }

    return {
      blocked: criticalBlocks.length > 0 || highBlocks.length > 0,
      results,
      criticalBlocks,
      highBlocks
    };
  }
}

export const hardBlockerValidator = new HardBlockerValidator();
