import { PositionType, EventType, PoliticalParty } from '@arb/core';

export interface ParsedPredictItMarket {
  exchange: 'PREDICTIT';
  positionType: PositionType;
  eventType: EventType;
  party: PoliticalParty;
  year: number | null;
  candidateName: string | null;
  state: string | null;
  rawId: string;
  rawTitle: string;
  confidence: number;
}

interface TitlePattern {
  pattern: RegExp;
  positionType: PositionType;
  eventType: EventType;
  partyGroup?: number;
  yearGroup?: number;
  candidateGroup?: number;
  stateGroup?: number;
}

export class PredictItParser {
  private readonly titlePatterns: TitlePattern[] = [
    // VP nominee: "2028 Republican vice presidential nominee"
    {
      pattern: /(\d{4})\s+(republican|democratic)\s+vice[- ]?president(?:ial)?\s+nomin/i,
      positionType: 'VICE_PRESIDENT',
      eventType: 'NOMINEE',
      yearGroup: 1,
      partyGroup: 2
    },
    // VP winner: "2028 Vice President winner", "Vice President 2028"
    {
      pattern: /(\d{4})\s+vice[- ]?president|vice[- ]?president(?:ial)?\s+.*(\d{4})/i,
      positionType: 'VICE_PRESIDENT',
      eventType: 'WINNER',
      yearGroup: 1
    },
    // President nominee: "2028 Republican presidential nominee"
    {
      pattern: /(\d{4})\s+(republican|democratic)\s+president(?:ial)?\s+nomin/i,
      positionType: 'PRESIDENT',
      eventType: 'NOMINEE',
      yearGroup: 1,
      partyGroup: 2
    },
    // President winner: "Who will win the 2028 presidential election?"
    {
      pattern: /(\d{4})\s+president(?:ial)?\s+(?:election|race)|president\s+in\s+(\d{4})/i,
      positionType: 'PRESIDENT',
      eventType: 'WINNER',
      yearGroup: 1
    },
    // Senate: "2026 Senate race in Texas"
    {
      pattern: /(\d{4})\s+(?:us\s+)?senate\s+(?:race|election|seat)/i,
      positionType: 'SENATE',
      eventType: 'WINNER',
      yearGroup: 1
    },
    // House: "2026 House race in CA-12"
    {
      pattern: /(\d{4})\s+(?:us\s+)?house\s+(?:race|election|seat)/i,
      positionType: 'HOUSE',
      eventType: 'WINNER',
      yearGroup: 1
    },
    // Governor: "2026 Governor race in California"
    {
      pattern: /(\d{4})\s+governor\s+(?:race|election)/i,
      positionType: 'GOVERNOR',
      eventType: 'WINNER',
      yearGroup: 1
    },
    // Electoral votes: "Electoral votes in Texas 2024"
    {
      pattern: /electoral\s+vote|(\d{4})\s+electoral/i,
      positionType: 'PRESIDENT',
      eventType: 'ELECTORAL_VOTES',
      yearGroup: 1
    },
    // Popular vote: "Popular vote winner 2024"
    {
      pattern: /popular\s+vote.*(\d{4})|(\d{4}).*popular\s+vote/i,
      positionType: 'PRESIDENT',
      eventType: 'POPULAR_VOTE',
      yearGroup: 1
    }
  ];

  private readonly vpIndicators = [
    /vice[- ]?president/i,
    /vice[- ]?presidential/i,
    /\bvp\b(?:\s|$)/i,
    /running\s+mate/i
  ];

  private readonly presidentIndicators = [
    /\bpresident(?!.*vice)/i,
    /\bpresidential(?!.*vice)/i,
    /\bpotus\b/i
  ];

  private readonly stateAbbreviations: Record<string, string> = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
  };

  parse(marketId: string, title: string, description?: string): ParsedPredictItMarket {
    const fullText = `${title} ${description || ''}`;

    // Try structured patterns first
    for (const { pattern, positionType, eventType, partyGroup, yearGroup } of this.titlePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const party = this.parseParty(partyGroup && match[partyGroup] ? match[partyGroup] : null);
        const year = this.parseYear(yearGroup && match[yearGroup] ? match[yearGroup] : null);
        const candidateName = this.extractCandidate(title);
        const state = this.extractState(fullText);

        return {
          exchange: 'PREDICTIT',
          positionType,
          eventType,
          party,
          year,
          candidateName,
          state,
          rawId: marketId,
          rawTitle: title,
          confidence: 0.9
        };
      }
    }

    // Fallback to heuristic parsing
    return this.parseHeuristic(marketId, title, description);
  }

  private parseHeuristic(marketId: string, title: string, description?: string): ParsedPredictItMarket {
    const fullText = `${title} ${description || ''}`;
    let positionType: PositionType = 'OTHER';
    let eventType: EventType = 'OTHER';
    let confidence = 0.3;

    // Check VP first (more specific)
    const isVp = this.vpIndicators.some(p => p.test(fullText));
    const isPresident = !isVp && this.presidentIndicators.some(p => p.test(fullText));

    if (isVp) {
      positionType = 'VICE_PRESIDENT';
      confidence = 0.8;
    } else if (isPresident) {
      positionType = 'PRESIDENT';
      confidence = 0.7;
    } else if (/\bsenate\b|\bsenator\b/i.test(fullText)) {
      positionType = 'SENATE';
      confidence = 0.7;
    } else if (/\bhouse\b|\bcongress(?:man|woman|person)?\b/i.test(fullText)) {
      positionType = 'HOUSE';
      confidence = 0.7;
    } else if (/\bgovernor\b/i.test(fullText)) {
      positionType = 'GOVERNOR';
      confidence = 0.7;
    } else if (/\bmayor\b/i.test(fullText)) {
      positionType = 'MAYOR';
      confidence = 0.7;
    }

    // Detect event type
    if (/\bnomin/i.test(fullText)) {
      eventType = 'NOMINEE';
      confidence = Math.min(confidence + 0.1, 1.0);
    } else if (/\bwin|winner|elect(?:ed|ion)\b/i.test(fullText)) {
      eventType = 'WINNER';
      confidence = Math.min(confidence + 0.05, 1.0);
    } else if (/electoral\s+vote/i.test(fullText)) {
      eventType = 'ELECTORAL_VOTES';
      confidence = Math.min(confidence + 0.1, 1.0);
    } else if (/popular\s+vote/i.test(fullText)) {
      eventType = 'POPULAR_VOTE';
      confidence = Math.min(confidence + 0.1, 1.0);
    } else if (/approval|rating/i.test(fullText)) {
      eventType = 'APPROVAL_RATING';
      confidence = Math.min(confidence + 0.1, 1.0);
    }

    const party = this.extractParty(fullText);
    const year = this.extractYear(fullText);
    const candidateName = this.extractCandidate(title);
    const state = this.extractState(fullText);

    return {
      exchange: 'PREDICTIT',
      positionType,
      eventType,
      party,
      year,
      candidateName,
      state,
      rawId: marketId,
      rawTitle: title,
      confidence
    };
  }

  private parseParty(text: string | null): PoliticalParty {
    if (!text) return null;
    const lower = text.toLowerCase();
    if (lower.includes('republican') || lower === 'r' || lower.includes('gop')) return 'REPUBLICAN';
    if (lower.includes('democrat') || lower === 'd') return 'DEMOCRAT';
    if (lower.includes('independent')) return 'INDEPENDENT';
    return null;
  }

  private extractParty(text: string): PoliticalParty {
    if (/\brepublican|GOP\b/i.test(text)) return 'REPUBLICAN';
    if (/\bdemocrat(?:ic)?\b/i.test(text)) return 'DEMOCRAT';
    if (/\bindependent\b/i.test(text)) return 'INDEPENDENT';
    return null;
  }

  private parseYear(text: string | null): number | null {
    if (!text) return null;
    const year = parseInt(text, 10);
    if (isNaN(year)) return null;
    if (year < 100) return 2000 + year;
    return year;
  }

  private extractYear(text: string): number | null {
    const match = text.match(/\b(20[2-3]\d)\b/);
    if (match) return parseInt(match[1], 10);
    return null;
  }

  private extractCandidate(title: string): string | null {
    // Common patterns: "Donald Trump", "J.D. Vance", etc.
    // Look for capitalized names that aren't common words
    const commonWords = new Set([
      'will', 'who', 'the', 'be', 'win', 'presidential', 'vice', 'president',
      'election', 'republican', 'democratic', 'nominee', 'party', 'senate',
      'house', 'governor', 'race', 'state', 'united', 'states'
    ]);

    const namePattern = /(?:^|:\s*)([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?(?:[A-Z][a-z]+)?)/g;
    const matches = [...title.matchAll(namePattern)];

    for (const match of matches) {
      const name = match[1].trim();
      const words = name.toLowerCase().split(/\s+/);
      if (!words.some(w => commonWords.has(w)) && words.length >= 1) {
        return name;
      }
    }

    return null;
  }

  private extractState(text: string): string | null {
    // Check for state abbreviations
    for (const [abbrev, fullName] of Object.entries(this.stateAbbreviations)) {
      const pattern = new RegExp(`\\b${abbrev}\\b|\\b${fullName}\\b`, 'i');
      if (pattern.test(text)) {
        return fullName;
      }
    }
    return null;
  }

  isVicePresident(title: string, description?: string): boolean {
    const parsed = this.parse('', title, description);
    return parsed.positionType === 'VICE_PRESIDENT';
  }

  isPresident(title: string, description?: string): boolean {
    const parsed = this.parse('', title, description);
    return parsed.positionType === 'PRESIDENT';
  }

  isPositionMismatch(
    title1: string, title2: string,
    description1?: string, description2?: string
  ): boolean {
    const parsed1 = this.parse('', title1, description1);
    const parsed2 = this.parse('', title2, description2);

    if (parsed1.confidence < 0.5 || parsed2.confidence < 0.5) {
      return false;
    }

    const pos1 = parsed1.positionType;
    const pos2 = parsed2.positionType;

    if ((pos1 === 'VICE_PRESIDENT' && pos2 === 'PRESIDENT') ||
        (pos1 === 'PRESIDENT' && pos2 === 'VICE_PRESIDENT')) {
      return true;
    }

    return false;
  }
}

export const predictItParser = new PredictItParser();
