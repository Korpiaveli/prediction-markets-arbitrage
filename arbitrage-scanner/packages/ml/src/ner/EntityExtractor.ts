import {
  ExtractedEntities,
  PersonEntity,
  LocationEntity,
  DateEntity,
  NumericEntity,
  OrganizationEntity,
  EntityMatchResult,
  EntityConflict,
  PoliticianDictEntry,
  OrganizationDictEntry,
  US_STATES,
  POLITICIANS_DATA,
  ORGANIZATIONS_DATA,
  COUNTRIES_DATA
} from './types.js';

const politicians = POLITICIANS_DATA;
const organizations = ORGANIZATIONS_DATA;
const countries = COUNTRIES_DATA;

export class EntityExtractor {
  private politicianIndex: Map<string, PoliticianDictEntry> = new Map();
  private organizationIndex: Map<string, OrganizationDictEntry> = new Map();
  private countryIndex: Map<string, { name: string; code: string }> = new Map();
  private stateIndex: Map<string, { name: string; code: string }> = new Map();

  constructor() {
    this.buildIndices();
  }

  private buildIndices(): void {
    for (const p of politicians) {
      const key = p.name.toLowerCase();
      this.politicianIndex.set(key, p);
      for (const alias of p.aliases) {
        this.politicianIndex.set(alias.toLowerCase(), p);
      }
    }

    for (const o of organizations) {
      const key = o.name.toLowerCase();
      this.organizationIndex.set(key, o);
      for (const alias of o.aliases) {
        this.organizationIndex.set(alias.toLowerCase(), o);
      }
    }

    for (const c of countries) {
      this.countryIndex.set(c.name.toLowerCase(), { name: c.name, code: c.code });
      this.countryIndex.set(c.code.toLowerCase(), { name: c.name, code: c.code });
      for (const alias of c.aliases) {
        this.countryIndex.set(alias.toLowerCase(), { name: c.name, code: c.code });
      }
    }

    for (const s of US_STATES) {
      this.stateIndex.set(s.name.toLowerCase(), { name: s.name, code: s.code });
      this.stateIndex.set(s.code.toLowerCase(), { name: s.name, code: s.code });
      for (const alias of s.aliases) {
        this.stateIndex.set(alias.toLowerCase(), { name: s.name, code: s.code });
      }
    }
  }

  extract(text: string): ExtractedEntities {
    const lower = text.toLowerCase();
    return {
      persons: this.extractPersons(text, lower),
      organizations: this.extractOrganizations(text, lower),
      locations: this.extractLocations(text, lower),
      dates: this.extractDates(text),
      numerics: this.extractNumerics(text),
      rawText: text,
      extractedAt: new Date()
    };
  }

  private extractPersons(text: string, lower: string): PersonEntity[] {
    const persons: PersonEntity[] = [];
    const seen = new Set<string>();

    for (const [key, politician] of this.politicianIndex) {
      if (key.length < 3) continue;
      const regex = new RegExp(`\\b${this.escapeRegex(key)}\\b`, 'i');
      if (regex.test(lower)) {
        const normKey = politician.name.toLowerCase();
        if (!seen.has(normKey)) {
          seen.add(normKey);
          persons.push({
            name: politician.name,
            normalizedName: politician.name.toLowerCase(),
            aliases: politician.aliases,
            role: 'politician',
            party: politician.party,
            position: politician.position,
            state: politician.state,
            confidence: key === normKey ? 1.0 : 0.9
          });
        }
      }
    }

    const titlePatterns = [
      /(?:President|Senator|Governor|Representative|Mayor|Secretary)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:for\s+)?(?:President|Senate|Governor|Congress)/g
    ];

    for (const pattern of titlePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1];
        const normName = name.toLowerCase();
        if (!seen.has(normName) && name.length > 2) {
          seen.add(normName);
          persons.push({
            name,
            normalizedName: normName,
            aliases: [],
            role: 'politician',
            confidence: 0.7
          });
        }
      }
    }

    return persons;
  }

  private extractOrganizations(_text: string, lower: string): OrganizationEntity[] {
    const orgs: OrganizationEntity[] = [];
    const seen = new Set<string>();

    for (const [key, org] of this.organizationIndex) {
      if (key.length < 2) continue;
      const regex = new RegExp(`\\b${this.escapeRegex(key)}\\b`, 'i');
      if (regex.test(lower)) {
        const normKey = org.name.toLowerCase();
        if (!seen.has(normKey)) {
          seen.add(normKey);
          orgs.push({
            name: org.name,
            normalizedName: normKey,
            type: org.type,
            aliases: org.aliases,
            country: org.country,
            confidence: key === normKey ? 1.0 : 0.9
          });
        }
      }
    }

    return orgs;
  }

  private extractLocations(_text: string, lower: string): LocationEntity[] {
    const locations: LocationEntity[] = [];
    const seen = new Set<string>();

    for (const [key, state] of this.stateIndex) {
      if (key.length < 2) continue;
      const regex = new RegExp(`\\b${this.escapeRegex(key)}\\.?\\b`, 'i');
      if (regex.test(lower)) {
        if (!seen.has(state.code)) {
          seen.add(state.code);
          locations.push({
            name: state.name,
            normalizedName: state.name.toLowerCase(),
            type: 'state',
            country: 'United States',
            stateCode: state.code,
            aliases: [],
            confidence: key === state.name.toLowerCase() ? 1.0 : 0.85
          });
        }
      }
    }

    for (const [key, country] of this.countryIndex) {
      if (key.length < 2) continue;
      const regex = new RegExp(`\\b${this.escapeRegex(key)}\\b`, 'i');
      if (regex.test(lower)) {
        if (!seen.has(country.code)) {
          seen.add(country.code);
          locations.push({
            name: country.name,
            normalizedName: country.name.toLowerCase(),
            type: 'country',
            aliases: [],
            confidence: key === country.name.toLowerCase() ? 1.0 : 0.85
          });
        }
      }
    }

    const districtMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:congressional\s*)?district\b/);
    if (districtMatch) {
      locations.push({
        name: `District ${districtMatch[1]}`,
        normalizedName: `district-${districtMatch[1]}`,
        type: 'district',
        aliases: [],
        confidence: 0.95
      });
    }

    return locations;
  }

  private extractDates(text: string): DateEntity[] {
    const dates: DateEntity[] = [];

    const yearMatch = text.match(/\b(20\d{2})\b/g);
    if (yearMatch) {
      for (const y of yearMatch) {
        dates.push({
          raw: y,
          normalized: new Date(parseInt(y), 0, 1),
          type: 'year',
          year: parseInt(y),
          confidence: 1.0
        });
      }
    }

    const monthYearPatterns = [
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(20\d{2})\b/gi
    ];

    const monthMap: Record<string, number> = {
      january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
      april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
      august: 7, aug: 7, september: 8, sep: 8, october: 9, oct: 9,
      november: 10, nov: 10, december: 11, dec: 11
    };

    for (const pattern of monthYearPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const month = monthMap[match[1].toLowerCase()];
        const year = parseInt(match[2]);
        dates.push({
          raw: match[0],
          normalized: new Date(year, month, 1),
          type: 'month',
          year,
          month: month + 1,
          confidence: 0.95
        });
      }
    }

    const quarterMatch = text.match(/\bQ([1-4])\s*(20\d{2})\b/i);
    if (quarterMatch) {
      const quarter = parseInt(quarterMatch[1]);
      const year = parseInt(quarterMatch[2]);
      dates.push({
        raw: quarterMatch[0],
        normalized: new Date(year, (quarter - 1) * 3, 1),
        type: 'quarter',
        year,
        month: (quarter - 1) * 3 + 1,
        confidence: 0.95
      });
    }

    return dates;
  }

  private extractNumerics(text: string): NumericEntity[] {
    const numerics: NumericEntity[] = [];

    const percentPatterns = [
      /(\d+(?:\.\d+)?)\s*%/g,
      /(\d+(?:\.\d+)?)\s*percent/gi
    ];

    for (const pattern of percentPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const value = parseFloat(match[1]);
        let context: 'above' | 'below' | 'exactly' | 'range' | undefined;
        const beforeText = text.slice(Math.max(0, match.index - 20), match.index).toLowerCase();
        if (/above|over|more than|greater|exceed/.test(beforeText)) context = 'above';
        else if (/below|under|less than|fewer/.test(beforeText)) context = 'below';
        else if (/exactly|at|equal/.test(beforeText)) context = 'exactly';

        numerics.push({
          raw: match[0],
          value,
          type: 'percentage',
          unit: '%',
          context,
          confidence: 0.95
        });
      }
    }

    const countPatterns = [
      /(\d+)\s*(?:times?|seats?|votes?|states?|delegates?)/gi
    ];

    for (const pattern of countPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        numerics.push({
          raw: match[0],
          value: parseInt(match[1]),
          type: 'count',
          confidence: 0.9
        });
      }
    }

    const thresholdPatterns = [
      /(?:above|over|exceed|below|under)\s*(\d+(?:\.\d+)?)/gi
    ];

    for (const pattern of thresholdPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const context = /above|over|exceed/.test(match[0].toLowerCase()) ? 'above' : 'below';
        numerics.push({
          raw: match[0],
          value: parseFloat(match[1]),
          type: 'threshold',
          context,
          confidence: 0.9
        });
      }
    }

    return numerics;
  }

  compareEntities(entities1: ExtractedEntities, entities2: ExtractedEntities): EntityMatchResult {
    const conflicts: EntityConflict[] = [];

    const personOverlap = this.calculatePersonOverlap(entities1.persons, entities2.persons, conflicts);
    const locationOverlap = this.calculateLocationOverlap(entities1.locations, entities2.locations, conflicts);
    const dateOverlap = this.calculateDateOverlap(entities1.dates, entities2.dates, conflicts);
    const numericOverlap = this.calculateNumericOverlap(entities1.numerics, entities2.numerics, conflicts);
    const organizationOverlap = this.calculateOrgOverlap(entities1.organizations, entities2.organizations, conflicts);

    const hasCritical = conflicts.some(c => c.severity === 'critical');
    const hasHigh = conflicts.some(c => c.severity === 'high');

    return {
      entitiesMatch: !hasCritical && !hasHigh,
      personOverlap,
      locationOverlap,
      dateOverlap,
      numericOverlap,
      organizationOverlap,
      conflicts,
      confidence: hasCritical ? 0.1 : hasHigh ? 0.4 : 0.8
    };
  }

  private calculatePersonOverlap(p1: PersonEntity[], p2: PersonEntity[], conflicts: EntityConflict[]): number {
    if (p1.length === 0 && p2.length === 0) return 1.0;
    if (p1.length === 0 || p2.length === 0) return 0.5;

    let matches = 0;
    const matched2 = new Set<number>();

    for (const person1 of p1) {
      let found = false;
      for (let i = 0; i < p2.length; i++) {
        if (matched2.has(i)) continue;
        const person2 = p2[i];
        if (this.personsMatch(person1, person2)) {
          matches++;
          matched2.add(i);
          found = true;
          break;
        }
      }

      if (!found && p1.length === 1 && p2.length === 1) {
        conflicts.push({
          type: 'person',
          entity1: person1.name,
          entity2: p2[0].name,
          reason: `Different persons: ${person1.name} vs ${p2[0].name}`,
          severity: 'high'
        });
      }
    }

    return matches / Math.max(p1.length, p2.length);
  }

  private personsMatch(p1: PersonEntity, p2: PersonEntity): boolean {
    if (p1.normalizedName === p2.normalizedName) return true;

    const allNames1 = [p1.normalizedName, ...p1.aliases.map(a => a.toLowerCase())];
    const allNames2 = [p2.normalizedName, ...p2.aliases.map(a => a.toLowerCase())];

    for (const n1 of allNames1) {
      for (const n2 of allNames2) {
        if (n1 === n2) return true;
        if (n1.includes(n2) || n2.includes(n1)) return true;
      }
    }

    const lastName1 = p1.normalizedName.split(' ').pop() || '';
    const lastName2 = p2.normalizedName.split(' ').pop() || '';
    if (lastName1.length > 3 && lastName1 === lastName2) return true;

    return false;
  }

  private calculateLocationOverlap(l1: LocationEntity[], l2: LocationEntity[], conflicts: EntityConflict[]): number {
    if (l1.length === 0 && l2.length === 0) return 1.0;
    if (l1.length === 0 || l2.length === 0) return 0.5;

    const states1 = l1.filter(l => l.type === 'state');
    const states2 = l2.filter(l => l.type === 'state');
    const districts1 = l1.filter(l => l.type === 'district');
    const districts2 = l2.filter(l => l.type === 'district');

    if (states1.length > 0 && states2.length > 0) {
      const stateMatch = states1.some(s1 =>
        states2.some(s2 => s1.stateCode === s2.stateCode)
      );
      if (!stateMatch) {
        conflicts.push({
          type: 'location',
          entity1: states1.map(s => s.name).join(', '),
          entity2: states2.map(s => s.name).join(', '),
          reason: `Different states: ${states1[0].name} vs ${states2[0].name}`,
          severity: 'critical'
        });
        return 0;
      }
    }

    if (districts1.length > 0 && districts2.length > 0) {
      const districtMatch = districts1.some(d1 =>
        districts2.some(d2 => d1.normalizedName === d2.normalizedName)
      );
      if (!districtMatch) {
        conflicts.push({
          type: 'location',
          entity1: districts1[0].name,
          entity2: districts2[0].name,
          reason: `Different districts: ${districts1[0].name} vs ${districts2[0].name}`,
          severity: 'critical'
        });
        return 0;
      }
    }

    let matches = 0;
    for (const loc1 of l1) {
      for (const loc2 of l2) {
        if (loc1.normalizedName === loc2.normalizedName ||
            (loc1.stateCode && loc1.stateCode === loc2.stateCode)) {
          matches++;
          break;
        }
      }
    }

    return matches / Math.max(l1.length, l2.length);
  }

  private calculateDateOverlap(d1: DateEntity[], d2: DateEntity[], conflicts: EntityConflict[]): number {
    if (d1.length === 0 && d2.length === 0) return 1.0;
    if (d1.length === 0 || d2.length === 0) return 0.5;

    const years1 = d1.filter(d => d.year).map(d => d.year!);
    const years2 = d2.filter(d => d.year).map(d => d.year!);

    if (years1.length > 0 && years2.length > 0) {
      const yearMatch = years1.some(y1 => years2.some(y2 => Math.abs(y1 - y2) <= 1));
      if (!yearMatch) {
        conflicts.push({
          type: 'date',
          entity1: years1.join(', '),
          entity2: years2.join(', '),
          reason: `Different years: ${years1[0]} vs ${years2[0]}`,
          severity: 'high'
        });
        return 0;
      }
    }

    return 1.0;
  }

  private calculateNumericOverlap(n1: NumericEntity[], n2: NumericEntity[], conflicts: EntityConflict[]): number {
    if (n1.length === 0 && n2.length === 0) return 1.0;
    if (n1.length === 0 || n2.length === 0) return 0.5;

    const thresholds1 = n1.filter(n => n.type === 'threshold' || n.type === 'percentage');
    const thresholds2 = n2.filter(n => n.type === 'threshold' || n.type === 'percentage');

    if (thresholds1.length > 0 && thresholds2.length > 0) {
      const hasMatch = thresholds1.some(t1 =>
        thresholds2.some(t2 => Math.abs(t1.value - t2.value) < 2)
      );
      if (!hasMatch) {
        conflicts.push({
          type: 'numeric',
          entity1: thresholds1.map(t => `${t.value}${t.unit || ''}`).join(', '),
          entity2: thresholds2.map(t => `${t.value}${t.unit || ''}`).join(', '),
          reason: `Different thresholds: ${thresholds1[0].value} vs ${thresholds2[0].value}`,
          severity: 'high'
        });
        return 0;
      }
    }

    return 1.0;
  }

  private calculateOrgOverlap(o1: OrganizationEntity[], o2: OrganizationEntity[], _conflicts: EntityConflict[]): number {
    if (o1.length === 0 && o2.length === 0) return 1.0;
    if (o1.length === 0 || o2.length === 0) return 0.5;

    let matches = 0;
    for (const org1 of o1) {
      for (const org2 of o2) {
        if (org1.normalizedName === org2.normalizedName) {
          matches++;
          break;
        }
      }
    }

    return matches / Math.max(o1.length, o2.length);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export const entityExtractor = new EntityExtractor();
