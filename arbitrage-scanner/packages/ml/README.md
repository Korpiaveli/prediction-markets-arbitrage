# @arb/ml - Machine Learning Module

Machine learning enhancement for market matching and resolution risk prediction.

## Overview

This module provides ML-powered predictions that enhance the rule-based heuristics in MarketMatcher and ResolutionAnalyzer. The models are trained on historical 2024 election data and calibrated for optimal performance.

## Features

- **Market Matching Predictor**: Predicts if two markets will resolve identically
- **Resolution Risk Predictor**: Assesses resolution alignment risk
- **Feature Engineering**: Extracts 11 features from market pairs
- **Recommendations**: Provides trading recommendations (STRONG_BUY, BUY, CAUTION, AVOID)

## Usage

```typescript
import { ModelService } from '@arb/ml';

// Initialize service
const mlService = new ModelService();
mlService.initialize();

// Get predictions
const prediction = mlService.predict(
  kalshiMarket,
  polyMarket,
  baselineMatchScore,   // From MarketMatcher
  baselineAlignment     // From ResolutionAnalyzer
);

console.log(prediction.matching.willMatch);        // boolean
console.log(prediction.matching.finalScore);       // 0-100
console.log(prediction.resolution.tradeable);      // boolean
console.log(prediction.recommendation);            // 'strong_buy' | 'buy' | 'caution' | 'avoid'
```

## Model Performance

**Validated on 2024 Presidential Election Data (5 market pairs)**

| Metric | Baseline | ML Enhanced |
|--------|----------|-------------|
| Matching Accuracy | 80% | 80% |
| Resolution Accuracy | 80% | 80% |
| Threshold | 55% | 55% |

## Feature Weights

### Market Matching Model
| Feature | Weight | Importance |
|---------|--------|------------|
| keyword_overlap | 0.25 | Highest |
| category_match | 0.15 | High |
| title_similarity | 0.12 | Moderate |
| sources_match | 0.12 | Moderate |
| timing_match | 0.10 | Moderate |
| description_similarity | 0.08 | Lower |
| alignment_score | 0.08 | Lower |
| volume_ratio | 0.03 | Low |
| price_correlation | 0.03 | Low |
| length_ratio | 0.02 | Low |
| avg_word_count | 0.02 | Low |

### Resolution Risk Model
| Feature | Weight | Importance |
|---------|--------|------------|
| sources_match | 0.25 | Highest (critical for resolution) |
| keyword_overlap | 0.15 | High |
| category_match | 0.12 | Moderate |
| timing_match | 0.12 | Moderate (important for resolution) |
| alignment_score | 0.12 | Moderate |
| title_similarity | 0.08 | Lower |
| description_similarity | 0.05 | Low |
| volume_ratio | 0.03 | Low |
| price_correlation | 0.03 | Low |
| length_ratio | 0.03 | Low |
| avg_word_count | 0.02 | Low |

## Training

To retrain models with new data:

```bash
cd ml_training
pip install -r requirements.txt
python train_models.py
```

Output: `trained_models.json` with new weights

## Files

```
packages/ml/
├── src/
│   ├── index.ts          # Exports
│   ├── types.ts          # Type definitions
│   ├── features.ts       # Feature extraction
│   ├── matching.ts       # Matching predictor
│   ├── resolution.ts     # Resolution risk predictor
│   └── service.ts        # Combined service
└── README.md

ml_training/
├── train_models.py       # Python training script
├── requirements.txt      # Python dependencies
└── trained_models.json   # Trained weights (output)
```

## Key Insights from Calibration

1. **Keyword overlap** is the most reliable feature (72-100% in all matches)
2. **Sources matching** is critical for resolution risk assessment
3. **Title similarity** is less reliable due to phrasing variations
4. **Category matching** provides strong confirmation signal
5. **ML boost** provides small adjustments (-3 to +3 points typically)

## Recommendations

- **STRONG_BUY**: High matching (80+) & low risk (85+ alignment)
- **BUY**: Moderate matching (60-79) & acceptable risk (70+ alignment)
- **CAUTION**: Lower confidence - manual review recommended
- **AVOID**: Insufficient confidence for trading
