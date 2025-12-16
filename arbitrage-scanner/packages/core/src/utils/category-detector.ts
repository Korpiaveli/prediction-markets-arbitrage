import { MarketCategory } from '../types/market.js';

export interface CategoryPattern {
  category: MarketCategory;
  keywords: string[];
  patterns: RegExp[];
  priority: number; // Higher = checked first
}

export const CATEGORY_PATTERNS: CategoryPattern[] = [
  {
    category: 'politics',
    priority: 10,
    keywords: [
      'election', 'vote', 'president', 'senate', 'congress', 'house', 'democrat', 'republican',
      'caucus', 'primary', 'poll', 'governor', 'mayor', 'candidate', 'campaign', 'ballot',
      'impeachment', 'nomination', 'supreme court', 'scotus', 'legislation', 'bill', 'veto',
      'senate', 'representative', 'electoral', 'midterm', 'republican', 'democratic', 'gop',
      'liberal', 'conservative', 'political', 'politician', 'kamala', 'biden', 'trump',
      'desantis', 'newsom', 'harris', 'pence', 'senate majority', 'house majority', 'trifecta'
    ],
    patterns: [
      /\b(election|vote|president|senate|congress|house)\b/i,
      /\b(democrat|republican|gop|dnc|rnc)\b/i,
      /\b202[4-8]\s*(election|presidential|midterm)/i,
      /\b(kamala|biden|trump|desantis|newsom|harris|pence)\b/i
    ]
  },
  {
    category: 'sports',
    priority: 9,
    keywords: [
      'nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football', 'basketball', 'baseball', 'hockey',
      'game', 'playoff', 'championship', 'super bowl', 'world series', 'stanley cup',
      'fifa', 'uefa', 'premier league', 'la liga', 'bundesliga', 'serie a', 'mls',
      'ncaa', 'college football', 'march madness', 'bowl game', 'finals',
      'quarterback', 'touchdown', 'field goal', 'home run', 'goal', 'assist',
      'spread', 'over/under', 'moneyline', 'handicap', 'team', 'player', 'match',
      'arsenal', 'chelsea', 'manchester', 'liverpool', 'barcelona', 'real madrid',
      'lakers', 'warriors', 'celtics', 'yankees', 'red sox', 'cowboys', 'patriots'
    ],
    patterns: [
      /\b(nfl|nba|mlb|nhl|mls|ncaa)\b/i,
      /\b(super bowl|world series|stanley cup|march madness)\b/i,
      /\b(playoff|championship|final|game|match|vs\.)\b/i,
      /\b(touchdown|field goal|home run|goal|basket)\b/i,
      /\b(spread|over\/under|o\/u|\+\d+|-\d+)\b/i
    ]
  },
  {
    category: 'crypto',
    priority: 8,
    keywords: [
      'bitcoin', 'ethereum', 'btc', 'eth', 'crypto', 'cryptocurrency', 'blockchain',
      'defi', 'nft', 'token', 'coin', 'solana', 'cardano', 'polkadot', 'dogecoin',
      'binance', 'coinbase', 'ftx', 'exchange', 'wallet', 'mining', 'staking',
      'xrp', 'ripple', 'litecoin', 'matic', 'polygon', 'avalanche', 'chainlink',
      'uniswap', 'compound', 'aave', 'maker', 'dao', 'web3', 'metaverse'
    ],
    patterns: [
      /\b(bitcoin|ethereum|btc|eth|crypto|blockchain)\b/i,
      /\b(defi|nft|dao|web3)\b/i,
      /\b(solana|cardano|polkadot|dogecoin|xrp|matic)\b/i,
      /\$\d+k?\s*(bitcoin|btc|ethereum|eth)/i
    ]
  },
  {
    category: 'economy',
    priority: 7,
    keywords: [
      'fed', 'federal reserve', 'interest rate', 'inflation', 'cpi', 'gdp', 'recession',
      'unemployment', 'jobs report', 'payroll', 'economy', 'economic', 'financial',
      'stock market', 'dow jones', 's&p 500', 'nasdaq', 'sp500', 'djia',
      'bull market', 'bear market', 'crash', 'correction', 'rally',
      'treasury', 'bond', 'yield', 'debt ceiling', 'budget', 'deficit',
      'trade war', 'tariff', 'sanctions', 'fomc', 'powell', 'yellen'
    ],
    patterns: [
      /\b(fed|federal reserve|fomc)\b/i,
      /\b(inflation|cpi|gdp|recession|unemployment)\b/i,
      /\b(interest rate|rate hike|rate cut)\b/i,
      /\b(stock market|dow jones|s&p 500|nasdaq)\b/i,
      /\b(treasury|bond|yield)\b/i
    ]
  },
  {
    category: 'technology',
    priority: 6,
    keywords: [
      'ai', 'artificial intelligence', 'gpt', 'openai', 'chatgpt', 'claude', 'anthropic',
      'tech', 'software', 'google', 'apple', 'microsoft', 'meta', 'amazon', 'facebook',
      'twitter', 'spacex', 'tesla', 'nvidia', 'amd', 'intel', 'samsung',
      'iphone', 'android', 'ios', 'windows', 'mac', 'linux',
      'cloud', 'aws', 'azure', 'gcp', 'quantum', 'robotics', 'automation',
      'silicon valley', 'startup', 'ipo', 'venture capital', 'elon musk'
    ],
    patterns: [
      /\b(ai|artificial intelligence|gpt|openai|claude)\b/i,
      /\b(google|apple|microsoft|meta|amazon|facebook|twitter)\b/i,
      /\b(tesla|spacex|nvidia|intel|samsung)\b/i,
      /\b(iphone|android|windows|cloud|quantum)\b/i
    ]
  },
  {
    category: 'entertainment',
    priority: 5,
    keywords: [
      'movie', 'film', 'box office', 'oscars', 'academy awards', 'emmys', 'grammys',
      'netflix', 'disney', 'marvel', 'star wars', 'hbo', 'streaming', 'series',
      'taylor swift', 'beyonce', 'music', 'album', 'concert', 'tour',
      'celebrity', 'actor', 'actress', 'director', 'hollywood', 'blockbuster',
      'game of thrones', 'stranger things', 'mandalorian', 'avatar'
    ],
    patterns: [
      /\b(movie|film|box office|oscar|emmy|grammy)\b/i,
      /\b(netflix|disney|marvel|hbo|streaming)\b/i,
      /\b(taylor swift|beyonce|hollywood|blockbuster)\b/i
    ]
  },
  {
    category: 'science',
    priority: 4,
    keywords: [
      'nasa', 'space', 'mars', 'moon', 'rocket', 'spacecraft', 'satellite', 'iss',
      'climate', 'global warming', 'carbon', 'emissions', 'renewable', 'solar', 'wind',
      'vaccine', 'covid', 'pandemic', 'virus', 'medical', 'health', 'drug', 'fda',
      'physics', 'chemistry', 'biology', 'research', 'study', 'experiment',
      'nobel prize', 'discovery', 'breakthrough', 'scientific'
    ],
    patterns: [
      /\b(nasa|space|mars|moon|rocket)\b/i,
      /\b(climate|global warming|emissions|renewable)\b/i,
      /\b(vaccine|covid|pandemic|virus|medical)\b/i,
      /\b(nobel prize|discovery|breakthrough)\b/i
    ]
  }
];

export class CategoryDetector {
  detectCategories(title: string, description?: string, metadata?: Record<string, any>): MarketCategory[] {
    const text = `${title} ${description || ''}`.toLowerCase();
    const categories = new Set<MarketCategory>();

    // Check patterns in priority order
    const sortedPatterns = [...CATEGORY_PATTERNS].sort((a, b) => b.priority - a.priority);

    for (const pattern of sortedPatterns) {
      // Check regex patterns
      const matchesPattern = pattern.patterns.some(regex => regex.test(text));

      // Check keywords
      const matchesKeywords = pattern.keywords.some(keyword =>
        text.includes(keyword.toLowerCase())
      );

      if (matchesPattern || matchesKeywords) {
        categories.add(pattern.category);
      }
    }

    // Extract from metadata tags if available
    if (metadata?.tags && Array.isArray(metadata.tags)) {
      for (const tag of metadata.tags) {
        if (typeof tag !== 'string') continue;
        const tagLower = tag.toLowerCase();
        const matchingPattern = CATEGORY_PATTERNS.find(p =>
          p.keywords.some(k => tagLower.includes(k.toLowerCase()))
        );
        if (matchingPattern) {
          categories.add(matchingPattern.category);
        }
      }
    }

    // If no categories detected, default to 'other'
    if (categories.size === 0) {
      categories.add('other');
    }

    return Array.from(categories);
  }

  getPrimaryCategory(categories: MarketCategory[]): MarketCategory {
    if (categories.length === 0) return 'other';
    if (categories.length === 1) return categories[0];

    // Return highest priority category
    const priorityMap: Record<MarketCategory, number> = {
      politics: 10,
      sports: 9,
      crypto: 8,
      economy: 7,
      technology: 6,
      entertainment: 5,
      science: 4,
      other: 0
    };

    return categories.reduce((prev, curr) =>
      (priorityMap[curr] || 0) > (priorityMap[prev] || 0) ? curr : prev
    );
  }

  enhanceMarket<T extends { title: string; description?: string; metadata?: Record<string, any> }>(
    market: T
  ): T & { categories: MarketCategory[]; primaryCategory: MarketCategory } {
    const categories = this.detectCategories(market.title, market.description, market.metadata);
    const primaryCategory = this.getPrimaryCategory(categories);

    return {
      ...market,
      categories,
      primaryCategory
    };
  }

  filterByCategory(
    markets: Array<{ categories?: MarketCategory[] }>,
    allowedCategories?: MarketCategory[],
    excludedCategories?: MarketCategory[]
  ): typeof markets {
    return markets.filter(market => {
      if (!market.categories || market.categories.length === 0) {
        // If no categories, include if we're not filtering OR if 'other' is allowed
        return !allowedCategories || allowedCategories.includes('other');
      }

      // Check exclusions first
      if (excludedCategories && excludedCategories.length > 0) {
        const hasExcluded = market.categories.some(c => excludedCategories.includes(c));
        if (hasExcluded) return false;
      }

      // Check inclusions
      if (allowedCategories && allowedCategories.length > 0) {
        const hasAllowed = market.categories.some(c => allowedCategories.includes(c));
        return hasAllowed;
      }

      return true; // No filters specified
    });
  }
}

export const categoryDetector = new CategoryDetector();
