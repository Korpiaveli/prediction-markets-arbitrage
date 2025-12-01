#!/usr/bin/env tsx
/**
 * Historical Data Calibration Script
 * Tests MarketMatcher and ResolutionAnalyzer on known 2024 election market pairs
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Market } from '@arb/core';
import { MarketMatcher } from '../packages/scanner/src/MarketMatcher';
import { ResolutionAnalyzer } from '../packages/math/src/resolution';

interface HistoricalPair {
  pair_id: string;
  kalshi: any;
  polymarket: any;
  arbitrage_opportunity: any;
  resolution_alignment: any;
}

interface HistoricalDataset {
  metadata: any;
  overlapping_markets: HistoricalPair[];
  summary: any;
}

/**
 * Convert historical market data to Market object
 */
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

/**
 * Test market matcher on historical pairs
 */
async function testMarketMatcher(pairs: HistoricalPair[]) {
  console.log('=== MARKET MATCHER CALIBRATION ===\n');

  const matcher = new MarketMatcher({
    minConfidence: 55,
    includeLowConfidence: true,
    includeUncertain: true
  });

  const results = [];

  for (const pair of pairs) {
    const kalshiMarket = toMarket(pair.kalshi, 'KALSHI');
    const polyMarket = toMarket(pair.polymarket, 'POLYMARKET');

    // Manually analyze single pair using private method access workaround
    // We'll simulate the matching by calling the analyzer directly
    const analysis = (matcher as any).analyzeMatch(kalshiMarket, polyMarket);

    const actualResolved = pair.resolution_alignment.matched;

    results.push({
      pair_id: pair.pair_id,
      kalshi_title: pair.kalshi.title,
      poly_title: pair.polymarket.title,
      confidence: analysis.confidence,
      level: analysis.level,
      actual_resolved_same: actualResolved,
      should_match: analysis.confidence >= 55,
      correct_prediction: (analysis.confidence >= 55) === actualResolved,
      title_similarity: analysis.titleSimilarity,
      keyword_overlap: analysis.keywordOverlap,
      category_match: analysis.categoryMatch,
      reasons: analysis.reasons
    });
  }

  // Summary
  const correct = results.filter(r => r.correct_prediction).length;
  const total = results.length;
  const accuracy = (correct / total) * 100;

  console.log('Match Analysis Results:');
  console.log('-'.repeat(80));

  results.forEach(r => {
    const status = r.correct_prediction ? '✓' : '✗';
    console.log(`\n${status} ${r.pair_id} (Confidence: ${r.confidence.toFixed(1)}%, Level: ${r.level})`);
    console.log(`  Kalshi:     ${r.kalshi_title}`);
    console.log(`  Polymarket: ${r.poly_title}`);
    console.log(`  Title Similarity: ${r.title_similarity.toFixed(1)}%`);
    console.log(`  Keyword Overlap:  ${r.keyword_overlap.toFixed(1)}%`);
    console.log(`  Category Match:   ${r.category_match ? 'Yes' : 'No'}`);
    console.log(`  Predicted Match:  ${r.should_match ? 'Yes' : 'No'} (threshold: 55%)`);
    console.log(`  Actually Matched: ${r.actual_resolved_same ? 'Yes' : 'No'}`);
    console.log(`  Reasons: ${r.reasons.join(', ')}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log(`ACCURACY: ${correct}/${total} (${accuracy.toFixed(1)}%)`);
  console.log('='.repeat(80));

  return { results, accuracy };
}

/**
 * Test resolution analyzer on historical pairs
 */
async function testResolutionAnalyzer(pairs: HistoricalPair[]) {
  console.log('\n\n=== RESOLUTION ANALYZER CALIBRATION ===\n');

  const analyzer = new ResolutionAnalyzer();
  const results = [];

  for (const pair of pairs) {
    const kalshiMarket = toMarket(pair.kalshi, 'KALSHI');
    const polyMarket = toMarket(pair.polymarket, 'POLYMARKET');

    const alignment = analyzer.compareResolution(kalshiMarket, polyMarket);

    const actualResolved = pair.resolution_alignment.matched;

    results.push({
      pair_id: pair.pair_id,
      alignment_score: alignment.score,
      alignment_level: alignment.level,
      sources_match: alignment.sourcesMatch,
      timing_match: alignment.timingMatch,
      conditions_match: alignment.conditionsMatch,
      tradeable: alignment.tradeable,
      actual_resolved_same: actualResolved,
      correct_prediction: alignment.tradeable === actualResolved,
      risks: alignment.risks,
      warnings: alignment.warnings
    });
  }

  // Summary
  const correct = results.filter(r => r.correct_prediction).length;
  const total = results.length;
  const accuracy = (correct / total) * 100;

  console.log('Resolution Alignment Results:');
  console.log('-'.repeat(80));

  results.forEach(r => {
    const status = r.correct_prediction ? '✓' : '✗';
    console.log(`\n${status} ${r.pair_id} (Alignment: ${r.alignment_score.toFixed(0)}, Level: ${r.alignment_level})`);
    console.log(`  Sources Match:    ${r.sources_match ? 'Yes' : 'No'}`);
    console.log(`  Timing Match:     ${r.timing_match ? 'Yes' : 'No'}`);
    console.log(`  Conditions Match: ${r.conditions_match ? 'Yes' : 'No'}`);
    console.log(`  Tradeable:        ${r.tradeable ? 'Yes' : 'No'}`);
    console.log(`  Actually Matched: ${r.actual_resolved_same ? 'Yes' : 'No'}`);
    if (r.risks.length > 0) {
      console.log(`  Risks: ${r.risks.join('; ')}`);
    }
    if (r.warnings.length > 0) {
      console.log(`  Warnings: ${r.warnings.join('; ')}`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log(`ACCURACY: ${correct}/${total} (${accuracy.toFixed(1)}%)`);
  console.log(`Average Alignment Score: ${(results.reduce((sum, r) => sum + r.alignment_score, 0) / total).toFixed(1)}`);
  console.log('='.repeat(80));

  return { results, accuracy };
}

/**
 * Main calibration function
 */
async function main() {
  console.log('Historical Data Calibration - 2024 Presidential Election Markets');
  console.log('='
.repeat(80) + '\n');

  // Load historical data
  const dataPath = join(__dirname, '../data/historical_2024_election_markets.json');
  const data: HistoricalDataset = JSON.parse(readFileSync(dataPath, 'utf-8'));

  console.log(`Dataset: ${data.metadata.dataset}`);
  console.log(`Event Date: ${data.metadata.event_date}`);
  console.log(`Market Pairs: ${data.overlapping_markets.length}`);
  console.log(`Summary: ${data.summary.key_insights[0]}\n`);

  // Test market matcher
  const matcherResults = await testMarketMatcher(data.overlapping_markets);

  // Test resolution analyzer
  const resolutionResults = await testResolutionAnalyzer(data.overlapping_markets);

  // Final summary
  console.log('\n\n=== CALIBRATION SUMMARY ===\n');
  console.log(`Market Matcher Accuracy:     ${matcherResults.accuracy.toFixed(1)}%`);
  console.log(`Resolution Analyzer Accuracy: ${resolutionResults.accuracy.toFixed(1)}%`);

  console.log('\nKey Findings:');
  console.log('- All 5 pairs resolved identically (perfect ground truth)');
  console.log('- Price spreads averaged 4.6%, confirming real arbitrage existed');
  console.log('- Volume disparity: Polymarket 6.6x higher than Kalshi');

  console.log('\nRecommendations:');
  if (matcherResults.accuracy < 100) {
    console.log('⚠️  Market Matcher: Tune title/keyword weighting for better accuracy');
  } else {
    console.log('✓ Market Matcher: Performing well on historical data');
  }

  if (resolutionResults.accuracy < 100) {
    console.log('⚠️  Resolution Analyzer: Adjust source matching to reduce false negatives');
  } else {
    console.log('✓ Resolution Analyzer: Performing well on historical data');
  }

  console.log('\n' + '='.repeat(80));
}

main().catch(console.error);
