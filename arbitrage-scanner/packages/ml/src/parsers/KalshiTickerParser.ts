import { PositionType, EventType, PoliticalParty } from '@arb/core';

export interface ParsedKalshiTicker {
  exchange: 'KALSHI';
  positionType: PositionType;
  eventType: EventType;
  party: PoliticalParty;
  year: number | null;
  candidateCode: string | null;
  rawTicker: string;
  confidence: number;
}

interface TickerPattern {
  pattern: RegExp;
  positionType: PositionType;
  eventType: EventType;
  partyGroup?: number;
  yearGroup?: number;
  candidateGroup?: number;
}

export class KalshiTickerParser {
  private readonly patterns: TickerPattern[] = [
    // VP Nominee: KXVPRESNOMR-28-JDV or KXVPRESNOMD-28-ABC
    {
      pattern: /^KX(V)PRESNOM([RD])-(\d{2})(?:-([A-Z]+))?$/i,
      positionType: 'VICE_PRESIDENT',
      eventType: 'NOMINEE',
      partyGroup: 2,
      yearGroup: 3,
      candidateGroup: 4
    },
    // VP Winner: KXVPRES-28
    {
      pattern: /^KX(V)PRES-(\d{2})(?:-([A-Z]+))?$/i,
      positionType: 'VICE_PRESIDENT',
      eventType: 'WINNER',
      yearGroup: 2,
      candidateGroup: 3
    },
    // President Nominee: KXPRESNOMR-28-DT or KXPRESNOMD-28-JB
    {
      pattern: /^KXPRESNOM([RD])-(\d{2})(?:-([A-Z]+))?$/i,
      positionType: 'PRESIDENT',
      eventType: 'NOMINEE',
      partyGroup: 1,
      yearGroup: 2,
      candidateGroup: 3
    },
    // President Winner: KXPRES-28
    {
      pattern: /^KXPRES-(\d{2})(?:-([A-Z]+))?$/i,
      positionType: 'PRESIDENT',
      eventType: 'WINNER',
      yearGroup: 1,
      candidateGroup: 2
    },
    // Person-specific president: KXPERSONPRESMAM-45
    {
      pattern: /^KXPERSONPRES([A-Z]+)-(\d{2})$/i,
      positionType: 'PRESIDENT',
      eventType: 'WINNER',
      candidateGroup: 1,
      yearGroup: 2
    },
    // Senate: KXSENATE-STATE-28
    {
      pattern: /^KXSENATE[A-Z]*-(\d{2})(?:-([A-Z]+))?$/i,
      positionType: 'SENATE',
      eventType: 'WINNER',
      yearGroup: 1,
      candidateGroup: 2
    },
    // House: KXHOUSE-STATE-DISTRICT-28
    {
      pattern: /^KXHOUSE[A-Z0-9]*-(\d{2})(?:-([A-Z]+))?$/i,
      positionType: 'HOUSE',
      eventType: 'WINNER',
      yearGroup: 1,
      candidateGroup: 2
    },
    // Governor: KXGOV-STATE-28
    {
      pattern: /^KXGOV[A-Z]*-(\d{2})(?:-([A-Z]+))?$/i,
      positionType: 'GOVERNOR',
      eventType: 'WINNER',
      yearGroup: 1,
      candidateGroup: 2
    },
    // Electoral votes: KXEV-STATE-28
    {
      pattern: /^KXEV[A-Z]*-(\d{2})$/i,
      positionType: 'PRESIDENT',
      eventType: 'ELECTORAL_VOTES',
      yearGroup: 1
    },
    // Popular vote: KXPOPVOTE-28
    {
      pattern: /^KXPOP(?:VOTE)?-(\d{2})$/i,
      positionType: 'PRESIDENT',
      eventType: 'POPULAR_VOTE',
      yearGroup: 1
    }
  ];

  parse(ticker: string): ParsedKalshiTicker {
    const upperTicker = ticker.toUpperCase();

    for (const { pattern, positionType, eventType, partyGroup, yearGroup, candidateGroup } of this.patterns) {
      const match = upperTicker.match(pattern);
      if (match) {
        const party = this.parseParty(partyGroup ? match[partyGroup] : null);
        const year = this.parseYear(yearGroup ? match[yearGroup] : null);
        const candidateCode = candidateGroup ? match[candidateGroup] || null : null;

        return {
          exchange: 'KALSHI',
          positionType,
          eventType,
          party,
          year,
          candidateCode,
          rawTicker: ticker,
          confidence: 1.0
        };
      }
    }

    // Fallback: Try to detect VP/President from ticker string heuristically
    const heuristic = this.parseHeuristic(upperTicker);
    return {
      exchange: 'KALSHI',
      ...heuristic,
      rawTicker: ticker,
      confidence: heuristic.confidence
    };
  }

  private parseParty(code: string | null | undefined): PoliticalParty {
    if (!code) return null;
    const upper = code.toUpperCase();
    if (upper === 'R') return 'REPUBLICAN';
    if (upper === 'D') return 'DEMOCRAT';
    return null;
  }

  private parseYear(code: string | null | undefined): number | null {
    if (!code) return null;
    const twoDigit = parseInt(code, 10);
    if (isNaN(twoDigit)) return null;
    return 2000 + twoDigit;
  }

  private parseHeuristic(ticker: string): {
    positionType: PositionType;
    eventType: EventType;
    party: PoliticalParty;
    year: number | null;
    candidateCode: string | null;
    confidence: number;
  } {
    let positionType: PositionType = 'OTHER';
    let eventType: EventType = 'OTHER';
    let confidence = 0.3;

    // Check for VP indicator in ticker
    if (/VP|VICEP/i.test(ticker)) {
      positionType = 'VICE_PRESIDENT';
      confidence = 0.8;
    } else if (/PRES/i.test(ticker) && !/VP|VICE/i.test(ticker)) {
      positionType = 'PRESIDENT';
      confidence = 0.7;
    } else if (/SENATE|SEN/i.test(ticker)) {
      positionType = 'SENATE';
      confidence = 0.7;
    } else if (/HOUSE|CONG/i.test(ticker)) {
      positionType = 'HOUSE';
      confidence = 0.7;
    } else if (/GOV/i.test(ticker)) {
      positionType = 'GOVERNOR';
      confidence = 0.7;
    }

    // Check for event type
    if (/NOM/i.test(ticker)) {
      eventType = 'NOMINEE';
      confidence = Math.min(confidence + 0.1, 1.0);
    } else if (/WIN|ELECT/i.test(ticker)) {
      eventType = 'WINNER';
      confidence = Math.min(confidence + 0.1, 1.0);
    } else if (/EV\b|ELECTORAL/i.test(ticker)) {
      eventType = 'ELECTORAL_VOTES';
      confidence = Math.min(confidence + 0.1, 1.0);
    }

    // Try to extract year
    const yearMatch = ticker.match(/-(\d{2})(?:-|$)/);
    const year = yearMatch ? 2000 + parseInt(yearMatch[1], 10) : null;

    // Try to extract party
    let party: PoliticalParty = null;
    if (/NOMR\b|-R\b|REP/i.test(ticker)) {
      party = 'REPUBLICAN';
    } else if (/NOMD\b|-D\b|DEM/i.test(ticker)) {
      party = 'DEMOCRAT';
    }

    // Try to extract candidate code
    const candidateMatch = ticker.match(/-([A-Z]{2,})$/i);
    const candidateCode = candidateMatch ? candidateMatch[1] : null;

    return { positionType, eventType, party, year, candidateCode, confidence };
  }

  isVicePresident(ticker: string): boolean {
    const parsed = this.parse(ticker);
    return parsed.positionType === 'VICE_PRESIDENT';
  }

  isPresident(ticker: string): boolean {
    const parsed = this.parse(ticker);
    return parsed.positionType === 'PRESIDENT';
  }

  isPositionMismatch(ticker1: string, ticker2: string): boolean {
    const parsed1 = this.parse(ticker1);
    const parsed2 = this.parse(ticker2);

    // Only flag mismatch if both have high confidence and different position types
    if (parsed1.confidence < 0.5 || parsed2.confidence < 0.5) {
      return false;
    }

    const pos1 = parsed1.positionType;
    const pos2 = parsed2.positionType;

    // VP vs President is a critical mismatch
    if ((pos1 === 'VICE_PRESIDENT' && pos2 === 'PRESIDENT') ||
        (pos1 === 'PRESIDENT' && pos2 === 'VICE_PRESIDENT')) {
      return true;
    }

    return false;
  }
}

export const kalshiTickerParser = new KalshiTickerParser();
