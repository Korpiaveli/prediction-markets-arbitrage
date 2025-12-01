#!/usr/bin/env tsx
/**
 * Debug source extraction to understand why matching fails
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Market } from '@arb/core';
import { ResolutionAnalyzer } from '../packages/math/src/resolution';

function toMarket(data: any, exchange: 'KALSHI' | 'POLYMARKET'): Market {
  return {
    id: data.market_id,
    exchangeId: data.market_id,
    title: data.title,
    description: data.description,
    exchange,
    active: false,
    volume24h: data.volume_usd,
    closeTime: new Date(data.end_date),
    metadata: {
      category: data.category,
      source: data.source,
      resolutionOutcome: data.resolution_outcome,
      rulesPrimary: data.source,
      resolutionRules: data.source,
      finalPriceYes: data.final_price_yes
    }
  };
}

const dataPath = join(__dirname, '../data/historical_2024_election_markets.json');
const data = JSON.parse(readFileSync(dataPath, 'utf-8'));

const analyzer = new ResolutionAnalyzer();

console.log('Source Extraction Debug\n' + '='.repeat(80));

for (const pair of data.overlapping_markets) {
  const kalshi = toMarket(pair.kalshi, 'KALSHI');
  const poly = toMarket(pair.polymarket, 'POLYMARKET');

  const kalshiCriteria = analyzer.extractCriteria(kalshi);
  const polyCriteria = analyzer.extractCriteria(poly);

  console.log(`\n${pair.pair_id}:`);
  console.log(`  Kalshi source field: "${pair.kalshi.source}"`);
  console.log(`  Kalshi extracted:    [${kalshiCriteria.sources.join(', ')}]`);
  console.log(`  Poly source field:   "${pair.polymarket.source}"`);
  console.log(`  Poly extracted:      [${polyCriteria.sources.join(', ')}]`);

  const alignment = analyzer.compareResolution(kalshi, poly);
  console.log(`  Sources match? ${alignment.sourcesMatch ? '✓' : '✗'}`);
}
