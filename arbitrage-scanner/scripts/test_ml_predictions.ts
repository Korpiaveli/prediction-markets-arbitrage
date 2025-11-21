#!/usr/bin/env tsx
/**
 * ML Prediction Validation Test
 *
 * Tests the ML module predictions on historical 2024 election data
 * and compares with baseline heuristic scores.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Market } from '@arb/core';
import { ModelService, FeatureExtractor } from '../packages/ml/src';
import { MarketMatcher } from '../packages/scanner/src/MarketMatcher';
import { ResolutionAnalyzer } from '../packages/math/src/resolution';

interface HistoricalPair {
  pair_id: string;
  kalshi: any;
  polymarket: any;
  resolution_alignment: { matched: boolean };
}

function toMarket(data: any, exchange: 'KALSHI' | 'POLYMARKET'): Market {
  return {
    id: data.market_id,
    exchangeId: data.market_id,
    title: data.title,
    description: data.description,
    exchange,
    active: true,
    closeTime: new Date(data.end_date),
    volume24h: data.volume_usd,
    metadata: {
      category: data.category,
      source: data.source,
      lastPrice: data.final_price_yes
    }
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('ML Prediction Validation - Historical 2024 Election Data');
  console.log('='.repeat(70));

  // Load historical data
  const dataPath = join(__dirname, '../data/historical_2024_election_markets.json');
  const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
  const pairs: HistoricalPair[] = data.overlapping_markets;

  console.log(`\nDataset: ${data.metadata.dataset}`);
  console.log(`Pairs: ${pairs.length}`);
  console.log('\n');

  // Initialize models
  const mlService = new ModelService();
  mlService.initialize();

  const matcher = new MarketMatcher({ minConfidence: 55 });
  const resolutionAnalyzer = new ResolutionAnalyzer();
  const featureExtractor = new FeatureExtractor();

  // Test each pair
  const results = [];

  for (const pair of pairs) {
    const kalshi = toMarket(pair.kalshi, 'KALSHI');
    const poly = toMarket(pair.polymarket, 'POLYMARKET');
    const actualMatch = pair.resolution_alignment.matched;

    // Get baseline scores
    const baselineAnalysis = (matcher as any).analyzeMatch(kalshi, poly);
    const baselineResolution = resolutionAnalyzer.compareResolution(kalshi, poly);

    // Get ML predictions
    const mlPrediction = mlService.predict(
      kalshi,
      poly,
      baselineAnalysis.confidence,
      baselineResolution.score
    );

    // Extract features for display
    const features = featureExtractor.extractFeatures(kalshi, poly);

    results.push({
      pair_id: pair.pair_id,
      actual: actualMatch,
      baseline: {
        matchScore: baselineAnalysis.confidence,
        resolutionScore: baselineResolution.score,
        predictedMatch: baselineAnalysis.confidence >= 55,
        tradeable: baselineResolution.tradeable
      },
      ml: {
        matchScore: mlPrediction.matching.finalScore,
        mlBoost: mlPrediction.matching.mlBoost,
        resolutionScore: mlPrediction.resolution.finalAlignment,
        mlAdjustment: mlPrediction.resolution.mlAdjustment,
        predictedMatch: mlPrediction.matching.willMatch,
        tradeable: mlPrediction.tradeable,
        recommendation: mlPrediction.recommendation
      },
      keyFeatures: {
        keywordOverlap: features.keywordOverlap.toFixed(1) + '%',
        sourcesMatch: features.sourcesMatch === 1 ? 'Yes' : 'No'
      }
    });
  }

  // Display results
  console.log('-'.repeat(70));
  console.log('Results by Market Pair');
  console.log('-'.repeat(70));

  let baselineCorrect = 0;
  let mlCorrect = 0;

  for (const r of results) {
    const baselineOk = r.baseline.predictedMatch === r.actual;
    const mlOk = r.ml.predictedMatch === r.actual;

    if (baselineOk) baselineCorrect++;
    if (mlOk) mlCorrect++;

    console.log(`\n${r.pair_id}:`);
    console.log(`  Actual: ${r.actual ? 'MATCH' : 'NO MATCH'}`);
    console.log(`  Key Features: keyword=${r.keyFeatures.keywordOverlap}, sources=${r.keyFeatures.sourcesMatch}`);
    console.log(`  `);
    console.log(`  Baseline:`);
    console.log(`    Match Score: ${r.baseline.matchScore.toFixed(1)}% -> Predicted: ${r.baseline.predictedMatch ? 'MATCH' : 'NO MATCH'} ${baselineOk ? '[OK]' : '[WRONG]'}`);
    console.log(`    Resolution:  ${r.baseline.resolutionScore} -> Tradeable: ${r.baseline.tradeable ? 'Yes' : 'No'}`);
    console.log(`  `);
    console.log(`  ML Enhanced:`);
    console.log(`    Match Score: ${r.ml.matchScore.toFixed(1)}% (boost: ${r.ml.mlBoost > 0 ? '+' : ''}${r.ml.mlBoost.toFixed(1)}) -> Predicted: ${r.ml.predictedMatch ? 'MATCH' : 'NO MATCH'} ${mlOk ? '[OK]' : '[WRONG]'}`);
    console.log(`    Resolution:  ${r.ml.resolutionScore.toFixed(0)} (adj: ${r.ml.mlAdjustment > 0 ? '+' : ''}${r.ml.mlAdjustment.toFixed(1)}) -> Tradeable: ${r.ml.tradeable ? 'Yes' : 'No'}`);
    console.log(`    Recommendation: ${r.ml.recommendation.toUpperCase()}`);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  const total = results.length;
  console.log(`\nMatching Accuracy:`);
  console.log(`  Baseline: ${baselineCorrect}/${total} (${(baselineCorrect / total * 100).toFixed(0)}%)`);
  console.log(`  ML Enhanced: ${mlCorrect}/${total} (${(mlCorrect / total * 100).toFixed(0)}%)`);

  const mlImprovement = mlCorrect - baselineCorrect;
  if (mlImprovement > 0) {
    console.log(`\n  ML IMPROVEMENT: +${mlImprovement} correct predictions`);
  } else if (mlImprovement === 0) {
    console.log(`\n  ML matches baseline accuracy`);
  } else {
    console.log(`\n  ML performed ${-mlImprovement} worse than baseline`);
  }

  // Recommendations breakdown
  const recommendations = results.reduce((acc, r) => {
    acc[r.ml.recommendation] = (acc[r.ml.recommendation] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`\nRecommendation Breakdown:`);
  for (const [rec, count] of Object.entries(recommendations)) {
    console.log(`  ${rec.toUpperCase()}: ${count}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('[OK] ML Validation Complete');
  console.log('='.repeat(70));
}

main().catch(console.error);
