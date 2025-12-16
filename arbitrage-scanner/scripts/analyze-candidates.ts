import { KalshiAdapter, PolymarketAdapter, PredictItAdapter } from '@arb/exchanges';
import { HardBlockerValidator } from '@arb/ml';
import { Market } from '@arb/core';

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

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
  );
}

function calculateJaccard(title1: string, title2: string): number {
  const words1 = tokenize(title1);
  const words2 = tokenize(title2);
  if (words1.size === 0 || words2.size === 0) return 0;
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

const politicians = [
  'trump', 'biden', 'harris', 'vance', 'desantis', 'newsom', 'pence',
  'haley', 'ramaswamy', 'christie', 'kennedy', 'rfk', 'obama', 'clinton',
  'sanders', 'warren', 'buttigieg', 'mcconnell', 'pelosi', 'schumer'
];

function extractEntities(title: string): string[] {
  const entities: string[] = [];
  const lower = title.toLowerCase();
  for (const pol of politicians) {
    if (lower.includes(pol)) entities.push(pol);
  }
  const yearMatch = title.match(/\b(20\d{2})\b/);
  if (yearMatch) entities.push(yearMatch[1]);
  return entities;
}

async function main() {
  const kalshi = new KalshiAdapter({ testMode: false });
  const polymarket = new PolymarketAdapter({ testMode: false });
  const predictit = new PredictItAdapter({ testMode: false });
  const validator = new HardBlockerValidator();

  await kalshi.connect();
  await polymarket.connect();
  await predictit.connect();

  console.log('Fetching markets...');
  const kalshiMarkets = await kalshi.getMarkets({ categories: ['politics'], maxMarkets: 500 });
  const polyMarkets = await polymarket.getMarkets({ categories: ['politics'], maxMarkets: 500 });
  const predictitMarkets = await predictit.getMarkets({ categories: ['politics'], maxMarkets: 500 });

  console.log(`\nPredictIt: ${predictitMarkets.length} markets`);
  const piWithPrices = predictitMarkets.filter(m => m.priceSnapshot);
  console.log(`PredictIt with prices: ${piWithPrices.length}`);

  // Look for specific high-value keywords
  const highValueKeywords = ['president', 'trump', 'biden', 'harris', '2025', '2026', 'republican', 'democrat', 'senate', 'house'];

  console.log('\n=== KEYWORD SEARCH ===');
  for (const kw of highValueKeywords) {
    const kMatches = kalshiMarkets.filter(m => m.title.toLowerCase().includes(kw));
    const pMatches = polyMarkets.filter(m => m.title.toLowerCase().includes(kw));
    const piMatches = predictitMarkets.filter(m => m.title.toLowerCase().includes(kw));
    console.log(`  "${kw}": Kalshi ${kMatches.length}, Poly ${pMatches.length}, PI ${piMatches.length}`);
  }

  // Search for specific known overlapping topics
  console.log('\n=== SPECIFIC TOPIC SEARCH ===\n');

  const topics = [
    { name: '2028 Presidential', kFilter: (m: Market) => m.title.toLowerCase().includes('2028') && m.title.toLowerCase().includes('president'), pFilter: (m: Market) => m.title.toLowerCase().includes('2028') && m.title.toLowerCase().includes('president') },
    { name: 'Trump resign', kFilter: (m: Market) => m.title.toLowerCase().includes('trump') && m.title.toLowerCase().includes('resign'), pFilter: (m: Market) => m.title.toLowerCase().includes('trump') && m.title.toLowerCase().includes('resign') },
    { name: 'GOP nominee 2028', kFilter: (m: Market) => m.title.toLowerCase().includes('republican') && m.title.toLowerCase().includes('nomin'), pFilter: (m: Market) => m.title.toLowerCase().includes('republican') && m.title.toLowerCase().includes('nomin') },
    { name: 'Trump impeach', kFilter: (m: Market) => m.title.toLowerCase().includes('trump') && m.title.toLowerCase().includes('impeach'), pFilter: (m: Market) => m.title.toLowerCase().includes('trump') && m.title.toLowerCase().includes('impeach') },
    { name: 'Vance', kFilter: (m: Market) => m.title.toLowerCase().includes('vance'), pFilter: (m: Market) => m.title.toLowerCase().includes('vance') },
    { name: 'DeSantis', kFilter: (m: Market) => m.title.toLowerCase().includes('desantis'), pFilter: (m: Market) => m.title.toLowerCase().includes('desantis') },
  ];

  for (const topic of topics) {
    const kMatches = kalshiMarkets.filter(topic.kFilter);
    const pMatches = polyMarkets.filter(topic.pFilter);

    if (kMatches.length > 0 || pMatches.length > 0) {
      console.log(`--- ${topic.name} ---`);
      console.log(`  Kalshi (${kMatches.length}):`);
      kMatches.slice(0, 5).forEach(m => {
        const ps = m.priceSnapshot;
        console.log(`    ${m.title.substring(0, 70)}`);
        console.log(`      ID: ${m.id} | YES: ${ps?.yesAsk?.toFixed(3) || 'N/A'} NO: ${ps?.noAsk?.toFixed(3) || 'N/A'}`);
      });
      console.log(`  Polymarket (${pMatches.length}):`);
      pMatches.slice(0, 5).forEach(m => {
        const ps = m.priceSnapshot;
        console.log(`    ${m.title.substring(0, 70)}`);
        console.log(`      ID: ${m.id} | YES: ${ps?.yesAsk?.toFixed(3) || 'N/A'} NO: ${ps?.noAsk?.toFixed(3) || 'N/A'}`);
      });
      console.log('');
    }
  }

  // Show PredictIt market titles
  console.log('\n=== PREDICTIT SAMPLE MARKETS ===');
  piWithPrices.slice(0, 15).forEach(m => {
    const ps = m.priceSnapshot;
    console.log(`  ${m.title.substring(0, 70)}`);
    console.log(`    ID: ${m.id} | YES: ${ps?.yesAsk?.toFixed(3) || 'N/A'} NO: ${ps?.noAsk?.toFixed(3) || 'N/A'}`);
  });

  console.log('');

  const kWithPrices = kalshiMarkets.filter(m => m.priceSnapshot);
  const pWithPrices = polyMarkets.filter(m => m.priceSnapshot);

  // === KALSHI vs PREDICTIT ANALYSIS ===
  console.log('\n=== KALSHI vs PREDICTIT ANALYSIS ===\n');

  const kpiCandidates: any[] = [];
  for (const k of kWithPrices) {
    for (const pi of piWithPrices) {
      const kYes = k.priceSnapshot!.yesAsk;
      const kNo = k.priceSnapshot!.noAsk;
      const piYes = pi.priceSnapshot!.yesAsk;
      const piNo = pi.priceSnapshot!.noAsk;

      const combos = [
        { combo: 'K_YES+PI_NO', cost: kYes + piNo },
        { combo: 'K_NO+PI_YES', cost: kNo + piYes }
      ];

      for (const { combo, cost } of combos) {
        if (cost < 1.05) {
          const jaccard = calculateJaccard(k.title, pi.title);
          const kEntities = extractEntities(k.title);
          const piEntities = extractEntities(pi.title);
          const entityOverlap = kEntities.some(e => piEntities.includes(e));
          const blockResult = validator.validate(k, pi);

          kpiCandidates.push({
            k, pi,
            totalCost: cost,
            grossProfit: (1 - cost) * 100,
            combo,
            jaccard,
            kEntities,
            piEntities,
            entityOverlap,
            hardBlocker: blockResult.blocked ? blockResult.reason : null
          });
        }
      }
    }
  }

  kpiCandidates.sort((a, b) => b.jaccard - a.jaccard);

  console.log(`Found ${kpiCandidates.length} Kalshi-PredictIt candidates`);

  const kpiHighJaccard = kpiCandidates.filter(c => c.jaccard >= 0.20 && !c.hardBlocker);
  console.log(`\n--- HIGH SIMILARITY K-PI (Jaccard >= 0.20, no blocker): ${kpiHighJaccard.length} ---\n`);

  for (const c of kpiHighJaccard.slice(0, 20)) {
    const profitStr = c.grossProfit > 0 ? `+${c.grossProfit.toFixed(1)}%` : `${c.grossProfit.toFixed(1)}%`;
    console.log(`K-PI MATCH (Jaccard: ${c.jaccard.toFixed(3)}, Profit: ${profitStr})`);
    console.log(`  Kalshi: ${c.k.title}`);
    console.log(`    ID: ${c.k.id}`);
    console.log(`    YES: ${c.k.priceSnapshot!.yesAsk.toFixed(3)} | NO: ${c.k.priceSnapshot!.noAsk.toFixed(3)}`);
    console.log(`  PredictIt: ${c.pi.title}`);
    console.log(`    ID: ${c.pi.id}`);
    console.log(`    YES: ${c.pi.priceSnapshot!.yesAsk.toFixed(3)} | NO: ${c.pi.priceSnapshot!.noAsk.toFixed(3)}`);
    console.log(`  Shared: ${c.kEntities.filter((e: string) => c.piEntities.includes(e)).join(', ')}`);
    console.log('');
  }

  console.log('');

  console.log(`Kalshi: ${kWithPrices.length} markets with prices`);
  console.log(`Polymarket: ${pWithPrices.length} markets with prices`);

  interface Candidate {
    k: Market;
    p: Market;
    totalCost: number;
    grossProfit: number;
    combo: string;
    jaccard: number;
    kEntities: string[];
    pEntities: string[];
    entityOverlap: boolean;
    hardBlocker: string | null;
  }

  const candidates: Candidate[] = [];

  for (const k of kWithPrices) {
    for (const p of pWithPrices) {
      const kYes = k.priceSnapshot!.yesAsk;
      const kNo = k.priceSnapshot!.noAsk;
      const pYes = p.priceSnapshot!.yesAsk;
      const pNo = p.priceSnapshot!.noAsk;

      const combos = [
        { combo: 'K_YES+P_NO', cost: kYes + pNo },
        { combo: 'K_NO+P_YES', cost: kNo + pYes }
      ];

      for (const { combo, cost } of combos) {
        if (cost < 1.05) {  // Wider threshold to see more candidates
          const jaccard = calculateJaccard(k.title, p.title);
          const kEntities = extractEntities(k.title);
          const pEntities = extractEntities(p.title);
          const entityOverlap = kEntities.some(e => pEntities.includes(e));

          const blockResult = validator.validate(k, p);

          candidates.push({
            k, p,
            totalCost: cost,
            grossProfit: (1 - cost) * 100,
            combo,
            jaccard,
            kEntities,
            pEntities,
            entityOverlap,
            hardBlocker: blockResult.blocked ? blockResult.reason : null
          });
        }
      }
    }
  }

  candidates.sort((a, b) => a.totalCost - b.totalCost);

  console.log(`\nFound ${candidates.length} price-qualified candidates (cost < 0.98)\n`);

  // Show top candidates with high Jaccard similarity
  const highJaccard = candidates.filter(c => c.jaccard >= 0.25 && !c.hardBlocker);
  console.log(`=== HIGH SIMILARITY (Jaccard >= 0.25, no hard blocker): ${highJaccard.length} ===\n`);

  for (const c of highJaccard.slice(0, 20)) {
    console.log(`POTENTIAL MATCH (Jaccard: ${c.jaccard.toFixed(3)}, Profit: ${c.grossProfit.toFixed(1)}%)`);
    console.log(`  Kalshi: ${c.k.title}`);
    console.log(`    ID: ${c.k.id}`);
    console.log(`    Entities: ${c.kEntities.join(', ') || 'none'}`);
    console.log(`  Polymarket: ${c.p.title}`);
    console.log(`    ID: ${c.p.id}`);
    console.log(`    Entities: ${c.pEntities.join(', ') || 'none'}`);
    console.log(`  ${c.combo}: $${c.totalCost.toFixed(4)}`);
    console.log('');
  }

  // Show near-misses (Jaccard 0.15-0.25)
  const nearMiss = candidates.filter(c => c.jaccard >= 0.15 && c.jaccard < 0.25 && !c.hardBlocker && c.entityOverlap);
  console.log(`\n=== NEAR MISSES (Jaccard 0.15-0.25, entity overlap, no blocker): ${nearMiss.length} ===\n`);

  for (const c of nearMiss.slice(0, 20)) {
    console.log(`NEAR MISS (Jaccard: ${c.jaccard.toFixed(3)}, Profit: ${c.grossProfit.toFixed(1)}%)`);
    console.log(`  Kalshi: ${c.k.title}`);
    console.log(`    ID: ${c.k.id}`);
    console.log(`  Polymarket: ${c.p.title}`);
    console.log(`    ID: ${c.p.id}`);
    console.log(`  Shared entities: ${c.kEntities.filter(e => c.pEntities.includes(e)).join(', ')}`);
    console.log('');
  }

  // Show blocked candidates with high similarity
  const blockedHighSim = candidates.filter(c => c.jaccard >= 0.20 && c.hardBlocker);
  console.log(`\n=== BLOCKED HIGH SIMILARITY: ${blockedHighSim.length} ===\n`);

  for (const c of blockedHighSim.slice(0, 5)) {
    console.log(`BLOCKED (Jaccard: ${c.jaccard.toFixed(3)})`);
    console.log(`  Reason: ${c.hardBlocker}`);
    console.log(`  Kalshi: ${c.k.title}`);
    console.log(`  Polymarket: ${c.p.title}`);
    console.log('');
  }

  // Find best matching markets overall (highest Jaccard, same year, entity overlap)
  const sameYear = candidates.filter(c => {
    const kYear = c.k.year || extractEntities(c.k.title).find(e => /^20\d{2}$/.test(e));
    const pYear = c.p.year || extractEntities(c.p.title).find(e => /^20\d{2}$/.test(e));
    return kYear === pYear || (!kYear && !pYear);
  });

  const bestMatches = sameYear
    .filter(c => c.entityOverlap && !c.hardBlocker)
    .sort((a, b) => b.jaccard - a.jaccard);

  console.log(`\n=== BEST POTENTIAL MATCHES (same year, entity overlap, no blocker): ${bestMatches.length} ===\n`);

  for (const c of bestMatches.slice(0, 30)) {
    const profitStr = c.grossProfit > 0 ? `+${c.grossProfit.toFixed(1)}%` : `${c.grossProfit.toFixed(1)}%`;
    console.log(`MATCH (Jaccard: ${c.jaccard.toFixed(3)}, Profit: ${profitStr})`);
    console.log(`  Kalshi: ${c.k.title}`);
    console.log(`    ID: ${c.k.id}`);
    console.log(`    YES: ${c.k.priceSnapshot!.yesAsk.toFixed(3)} | NO: ${c.k.priceSnapshot!.noAsk.toFixed(3)}`);
    console.log(`  Polymarket: ${c.p.title}`);
    console.log(`    ID: ${c.p.id}`);
    console.log(`    YES: ${c.p.priceSnapshot!.yesAsk.toFixed(3)} | NO: ${c.p.priceSnapshot!.noAsk.toFixed(3)}`);
    console.log(`  Shared: ${c.kEntities.filter(e => c.pEntities.includes(e)).join(', ')}`);
    console.log('');
  }

  await kalshi.disconnect();
  await polymarket.disconnect();
  await predictit.disconnect();
}

main().catch(console.error);
