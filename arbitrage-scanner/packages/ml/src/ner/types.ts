export interface PersonEntity {
  name: string;
  normalizedName: string;
  aliases: string[];
  role?: 'politician' | 'ceo' | 'athlete' | 'celebrity' | 'other';
  party?: 'republican' | 'democrat' | 'independent' | 'other';
  position?: string;
  country?: string;
  state?: string;
  confidence: number;
}

export interface LocationEntity {
  name: string;
  normalizedName: string;
  type: 'country' | 'state' | 'city' | 'district' | 'region';
  country?: string;
  stateCode?: string;
  aliases: string[];
  confidence: number;
}

export interface DateEntity {
  raw: string;
  normalized: Date | null;
  type: 'year' | 'month' | 'day' | 'quarter' | 'range';
  year?: number;
  month?: number;
  day?: number;
  endDate?: Date;
  confidence: number;
}

export interface NumericEntity {
  raw: string;
  value: number;
  type: 'percentage' | 'count' | 'threshold' | 'currency' | 'ordinal' | 'other';
  unit?: string;
  context?: 'above' | 'below' | 'exactly' | 'range';
  comparison?: number;
  confidence: number;
}

export interface OrganizationEntity {
  name: string;
  normalizedName: string;
  type: 'government' | 'company' | 'sports_league' | 'political_party' | 'agency' | 'other';
  aliases: string[];
  country?: string;
  confidence: number;
}

export interface ExtractedEntities {
  persons: PersonEntity[];
  organizations: OrganizationEntity[];
  locations: LocationEntity[];
  dates: DateEntity[];
  numerics: NumericEntity[];
  rawText: string;
  extractedAt: Date;
}

export interface EntityMatchResult {
  entitiesMatch: boolean;
  personOverlap: number;
  locationOverlap: number;
  dateOverlap: number;
  numericOverlap: number;
  organizationOverlap: number;
  conflicts: EntityConflict[];
  confidence: number;
}

export interface EntityConflict {
  type: 'person' | 'location' | 'date' | 'numeric' | 'organization';
  entity1: string;
  entity2: string;
  reason: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface PoliticianDictEntry {
  name: string;
  aliases: string[];
  party: 'republican' | 'democrat' | 'independent' | 'other';
  position?: string;
  state?: string;
  active: boolean;
}

export interface OrganizationDictEntry {
  name: string;
  aliases: string[];
  type: 'government' | 'company' | 'sports_league' | 'political_party' | 'agency' | 'other';
  country?: string;
}

export interface CountryDictEntry {
  name: string;
  code: string;
  aliases: string[];
  demonym?: string;
  adjective?: string;
}

export interface StateDictEntry {
  name: string;
  code: string;
  aliases: string[];
}

export const US_STATES: StateDictEntry[] = [
  { name: 'Alabama', code: 'AL', aliases: ['ala', 'bama'] },
  { name: 'Alaska', code: 'AK', aliases: [] },
  { name: 'Arizona', code: 'AZ', aliases: ['ariz'] },
  { name: 'Arkansas', code: 'AR', aliases: ['ark'] },
  { name: 'California', code: 'CA', aliases: ['calif', 'cali', 'cal'] },
  { name: 'Colorado', code: 'CO', aliases: ['colo'] },
  { name: 'Connecticut', code: 'CT', aliases: ['conn'] },
  { name: 'Delaware', code: 'DE', aliases: ['del'] },
  { name: 'Florida', code: 'FL', aliases: ['fla'] },
  { name: 'Georgia', code: 'GA', aliases: [] },
  { name: 'Hawaii', code: 'HI', aliases: [] },
  { name: 'Idaho', code: 'ID', aliases: [] },
  { name: 'Illinois', code: 'IL', aliases: ['ill'] },
  { name: 'Indiana', code: 'IN', aliases: ['ind'] },
  { name: 'Iowa', code: 'IA', aliases: [] },
  { name: 'Kansas', code: 'KS', aliases: ['kan', 'kans'] },
  { name: 'Kentucky', code: 'KY', aliases: ['ky'] },
  { name: 'Louisiana', code: 'LA', aliases: [] },
  { name: 'Maine', code: 'ME', aliases: [] },
  { name: 'Maryland', code: 'MD', aliases: [] },
  { name: 'Massachusetts', code: 'MA', aliases: ['mass'] },
  { name: 'Michigan', code: 'MI', aliases: ['mich'] },
  { name: 'Minnesota', code: 'MN', aliases: ['minn'] },
  { name: 'Mississippi', code: 'MS', aliases: ['miss'] },
  { name: 'Missouri', code: 'MO', aliases: [] },
  { name: 'Montana', code: 'MT', aliases: ['mont'] },
  { name: 'Nebraska', code: 'NE', aliases: ['neb', 'nebr'] },
  { name: 'Nevada', code: 'NV', aliases: ['nev'] },
  { name: 'New Hampshire', code: 'NH', aliases: [] },
  { name: 'New Jersey', code: 'NJ', aliases: [] },
  { name: 'New Mexico', code: 'NM', aliases: [] },
  { name: 'New York', code: 'NY', aliases: ['ny'] },
  { name: 'North Carolina', code: 'NC', aliases: [] },
  { name: 'North Dakota', code: 'ND', aliases: [] },
  { name: 'Ohio', code: 'OH', aliases: [] },
  { name: 'Oklahoma', code: 'OK', aliases: ['okla'] },
  { name: 'Oregon', code: 'OR', aliases: ['ore'] },
  { name: 'Pennsylvania', code: 'PA', aliases: ['penn', 'penna'] },
  { name: 'Rhode Island', code: 'RI', aliases: [] },
  { name: 'South Carolina', code: 'SC', aliases: [] },
  { name: 'South Dakota', code: 'SD', aliases: [] },
  { name: 'Tennessee', code: 'TN', aliases: ['tenn'] },
  { name: 'Texas', code: 'TX', aliases: ['tex'] },
  { name: 'Utah', code: 'UT', aliases: [] },
  { name: 'Vermont', code: 'VT', aliases: [] },
  { name: 'Virginia', code: 'VA', aliases: [] },
  { name: 'Washington', code: 'WA', aliases: ['wash'] },
  { name: 'West Virginia', code: 'WV', aliases: [] },
  { name: 'Wisconsin', code: 'WI', aliases: ['wis', 'wisc'] },
  { name: 'Wyoming', code: 'WY', aliases: ['wyo'] },
  { name: 'District of Columbia', code: 'DC', aliases: ['d.c.', 'washington dc', 'washington d.c.'] }
];

export const POLITICIANS_DATA: PoliticianDictEntry[] = [
  { name: 'Donald Trump', aliases: ['trump', 'donald j trump', 'djt'], party: 'republican', position: 'President', active: true },
  { name: 'Joe Biden', aliases: ['biden', 'joseph biden'], party: 'democrat', position: 'President', active: true },
  { name: 'Kamala Harris', aliases: ['harris', 'kamala'], party: 'democrat', position: 'Vice President', active: true },
  { name: 'JD Vance', aliases: ['vance', 'j.d. vance', 'jd'], party: 'republican', position: 'Senator', state: 'OH', active: true },
  { name: 'Ron DeSantis', aliases: ['desantis'], party: 'republican', position: 'Governor', state: 'FL', active: true },
  { name: 'Gavin Newsom', aliases: ['newsom'], party: 'democrat', position: 'Governor', state: 'CA', active: true },
  { name: 'Nikki Haley', aliases: ['haley'], party: 'republican', position: 'Former Governor', state: 'SC', active: true },
  { name: 'Vivek Ramaswamy', aliases: ['ramaswamy', 'vivek'], party: 'republican', active: true },
  { name: 'Mike Pence', aliases: ['pence'], party: 'republican', position: 'Former VP', active: true },
  { name: 'Tim Walz', aliases: ['walz'], party: 'democrat', position: 'Governor', state: 'MN', active: true },
  { name: 'Pete Buttigieg', aliases: ['buttigieg', 'pete', 'mayor pete'], party: 'democrat', position: 'Secretary', active: true },
  { name: 'Bernie Sanders', aliases: ['sanders', 'bernie'], party: 'independent', position: 'Senator', state: 'VT', active: true },
  { name: 'Elizabeth Warren', aliases: ['warren'], party: 'democrat', position: 'Senator', state: 'MA', active: true },
  { name: 'Marco Rubio', aliases: ['rubio'], party: 'republican', position: 'Senator', state: 'FL', active: true },
  { name: 'Ted Cruz', aliases: ['cruz'], party: 'republican', position: 'Senator', state: 'TX', active: true },
  { name: 'Alexandria Ocasio-Cortez', aliases: ['aoc', 'ocasio-cortez'], party: 'democrat', position: 'Representative', state: 'NY', active: true },
  { name: 'Mitch McConnell', aliases: ['mcconnell'], party: 'republican', position: 'Senator', state: 'KY', active: true },
  { name: 'Chuck Schumer', aliases: ['schumer'], party: 'democrat', position: 'Senator', state: 'NY', active: true },
  { name: 'Nancy Pelosi', aliases: ['pelosi'], party: 'democrat', position: 'Representative', state: 'CA', active: true },
  { name: 'Hakeem Jeffries', aliases: ['jeffries'], party: 'democrat', position: 'Representative', state: 'NY', active: true },
  { name: 'Mike Johnson', aliases: ['johnson'], party: 'republican', position: 'Speaker', state: 'LA', active: true },
  { name: 'Chris Christie', aliases: ['christie'], party: 'republican', position: 'Former Governor', state: 'NJ', active: true },
  { name: 'Robert F Kennedy Jr', aliases: ['rfk', 'rfk jr', 'kennedy', 'bobby kennedy'], party: 'independent', active: true },
  { name: 'Josh Shapiro', aliases: ['shapiro'], party: 'democrat', position: 'Governor', state: 'PA', active: true },
  { name: 'Gretchen Whitmer', aliases: ['whitmer'], party: 'democrat', position: 'Governor', state: 'MI', active: true },
  { name: 'Greg Abbott', aliases: ['abbott'], party: 'republican', position: 'Governor', state: 'TX', active: true },
  { name: 'Kari Lake', aliases: ['lake'], party: 'republican', state: 'AZ', active: true },
  { name: 'Nasry Asfura', aliases: ['asfura', 'nasry', 'nasf'], party: 'other', active: true },
  { name: 'Salvador Nasralla', aliases: ['nasralla', 'navi'], party: 'other', active: true },
  { name: 'Rixi Moncada', aliases: ['moncada', 'rmon'], party: 'other', active: true },
  { name: 'Barack Obama', aliases: ['obama'], party: 'democrat', position: 'Former President', active: false },
  { name: 'Hillary Clinton', aliases: ['clinton', 'hillary', 'hrc'], party: 'democrat', active: false }
];

export const ORGANIZATIONS_DATA: OrganizationDictEntry[] = [
  { name: 'Republican Party', aliases: ['gop', 'republicans', 'rnc'], type: 'political_party', country: 'United States' },
  { name: 'Democratic Party', aliases: ['democrats', 'dnc', 'dems'], type: 'political_party', country: 'United States' },
  { name: 'Congress', aliases: ['us congress'], type: 'government', country: 'United States' },
  { name: 'Senate', aliases: ['us senate'], type: 'government', country: 'United States' },
  { name: 'House of Representatives', aliases: ['house', 'us house'], type: 'government', country: 'United States' },
  { name: 'Supreme Court', aliases: ['scotus'], type: 'government', country: 'United States' },
  { name: 'White House', aliases: ['the white house'], type: 'government', country: 'United States' },
  { name: 'Federal Reserve', aliases: ['fed', 'the fed', 'fomc'], type: 'agency', country: 'United States' },
  { name: 'Department of Justice', aliases: ['doj'], type: 'agency', country: 'United States' },
  { name: 'FBI', aliases: ['federal bureau of investigation'], type: 'agency', country: 'United States' },
  { name: 'NATO', aliases: ['north atlantic treaty organization'], type: 'government', country: 'International' },
  { name: 'United Nations', aliases: ['un'], type: 'government', country: 'International' },
  { name: 'European Union', aliases: ['eu'], type: 'government', country: 'International' },
  { name: 'NFL', aliases: ['national football league'], type: 'sports_league', country: 'United States' },
  { name: 'NBA', aliases: ['national basketball association'], type: 'sports_league', country: 'United States' },
  { name: 'Tesla', aliases: ['tsla'], type: 'company', country: 'United States' },
  { name: 'OpenAI', aliases: ['open ai'], type: 'company', country: 'United States' },
  { name: 'SpaceX', aliases: ['space x'], type: 'company', country: 'United States' }
];

export const COUNTRIES_DATA: { name: string; code: string; aliases: string[]; demonym?: string }[] = [
  { name: 'United States', code: 'US', aliases: ['usa', 'u.s.', 'america'], demonym: 'American' },
  { name: 'Honduras', code: 'HN', aliases: ['honduran'], demonym: 'Honduran' },
  { name: 'Mexico', code: 'MX', aliases: ['mexican'], demonym: 'Mexican' },
  { name: 'Canada', code: 'CA', aliases: ['canadian'], demonym: 'Canadian' },
  { name: 'United Kingdom', code: 'GB', aliases: ['uk', 'britain', 'england'], demonym: 'British' },
  { name: 'France', code: 'FR', aliases: ['french'], demonym: 'French' },
  { name: 'Germany', code: 'DE', aliases: ['german'], demonym: 'German' },
  { name: 'Ukraine', code: 'UA', aliases: ['ukrainian'], demonym: 'Ukrainian' },
  { name: 'Russia', code: 'RU', aliases: ['russian'], demonym: 'Russian' },
  { name: 'China', code: 'CN', aliases: ['chinese', 'prc'], demonym: 'Chinese' },
  { name: 'Japan', code: 'JP', aliases: ['japanese'], demonym: 'Japanese' },
  { name: 'India', code: 'IN', aliases: ['indian'], demonym: 'Indian' },
  { name: 'Israel', code: 'IL', aliases: ['israeli'], demonym: 'Israeli' },
  { name: 'Iran', code: 'IR', aliases: ['iranian'], demonym: 'Iranian' },
  { name: 'Brazil', code: 'BR', aliases: ['brazilian'], demonym: 'Brazilian' },
  { name: 'Australia', code: 'AU', aliases: ['australian'], demonym: 'Australian' },
  { name: 'South Korea', code: 'KR', aliases: ['korean'], demonym: 'Korean' },
  { name: 'North Korea', code: 'KP', aliases: ['dprk'], demonym: 'North Korean' },
  { name: 'Taiwan', code: 'TW', aliases: ['taiwanese'], demonym: 'Taiwanese' }
];
