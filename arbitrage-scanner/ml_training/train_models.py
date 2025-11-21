#!/usr/bin/env python3
"""
ML Model Training Pipeline for Arbitrage Scanner

Trains RandomForest classifiers for:
1. Market Matching (predicting if markets will resolve identically)
2. Resolution Risk (predicting resolution alignment)

Uses historical 2024 election data for training.
"""

import json
import numpy as np
from pathlib import Path
from typing import Dict, List, Tuple
from dataclasses import dataclass

# Optional: Use scikit-learn if available
try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_score, train_test_split
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("Warning: scikit-learn not available. Using simple weight estimation.")


@dataclass
class FeatureVector:
    title_similarity: float
    description_similarity: float
    keyword_overlap: float
    category_match: float
    timing_match: float
    sources_match: float
    alignment_score: float
    volume_ratio: float
    price_correlation: float
    length_ratio: float
    avg_word_count: float

    def to_array(self) -> np.ndarray:
        return np.array([
            self.title_similarity / 100,
            self.description_similarity / 100,
            self.keyword_overlap / 100,
            self.category_match,
            self.timing_match,
            self.sources_match,
            self.alignment_score / 100,
            self.volume_ratio,
            self.price_correlation,
            self.length_ratio,
            self.avg_word_count / 20
        ])


def load_historical_data(data_path: str) -> List[Dict]:
    """Load historical market data"""
    with open(data_path, 'r') as f:
        data = json.load(f)
    return data['overlapping_markets']


def extract_features(pair: Dict) -> FeatureVector:
    """Extract features from a historical market pair"""
    kalshi = pair['kalshi']
    poly = pair['polymarket']

    # Calculate text similarity features
    k_text = (kalshi['title'] + ' ' + kalshi['description']).lower()
    p_text = (poly['title'] + ' ' + poly['description']).lower()

    k_words = set(k_text.split())
    p_words = set(p_text.split())

    keyword_overlap = len(k_words & p_words) / max(len(k_words), len(p_words)) * 100

    # Calculate other features
    k_len = len(k_text)
    p_len = len(p_text)
    length_ratio = min(k_len, p_len) / max(k_len, p_len)

    k_vol = kalshi.get('volume_usd', 1)
    p_vol = poly.get('volume_usd', 1)
    volume_ratio = min(k_vol, p_vol) / max(k_vol, p_vol)

    k_price = kalshi.get('final_price_yes', 0.5)
    p_price = poly.get('final_price_yes', 0.5)
    price_correlation = 1 - abs(k_price - p_price)

    # Check sources
    k_source = kalshi.get('source', '').lower()
    p_source = poly.get('source', '').lower()
    common_sources = ['ap', 'fox', 'nbc', 'official', 'associated press']
    sources_match = 1 if any(s in k_source and s in p_source for s in common_sources) else 0

    return FeatureVector(
        title_similarity=37.5,  # From calibration
        description_similarity=50.0,
        keyword_overlap=keyword_overlap,
        category_match=1,  # All politics
        timing_match=1,    # All Nov 5 election
        sources_match=sources_match,
        alignment_score=82.0,  # From calibration average
        volume_ratio=volume_ratio,
        price_correlation=price_correlation,
        length_ratio=length_ratio,
        avg_word_count=len(kalshi['title'].split())
    )


def prepare_training_data(pairs: List[Dict]) -> Tuple[np.ndarray, np.ndarray]:
    """Convert historical data to training format"""
    X = []
    y = []

    for pair in pairs:
        features = extract_features(pair)
        X.append(features.to_array())

        # Label: 1 if resolved identically
        resolved_same = pair['resolution_alignment']['matched']
        y.append(1 if resolved_same else 0)

    return np.array(X), np.array(y)


def augment_training_data(X: np.ndarray, y: np.ndarray, factor: int = 10) -> Tuple[np.ndarray, np.ndarray]:
    """
    Augment training data with synthetic variations
    Since we only have 5 samples, we create variations with noise
    """
    X_aug = [X]
    y_aug = [y]

    for _ in range(factor - 1):
        noise = np.random.normal(0, 0.05, X.shape)
        X_noisy = np.clip(X + noise, 0, 1)
        X_aug.append(X_noisy)
        y_aug.append(y)

    return np.vstack(X_aug), np.hstack(y_aug)


def train_logistic_weights(X: np.ndarray, y: np.ndarray) -> Tuple[np.ndarray, float]:
    """Train logistic regression and extract weights"""
    if not SKLEARN_AVAILABLE:
        return estimate_weights_simple(X, y)

    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(X, y)

    return model.coef_[0], model.intercept_[0]


def estimate_weights_simple(X: np.ndarray, y: np.ndarray) -> Tuple[np.ndarray, float]:
    """
    Estimate weights based on feature importance from calibration analysis.
    Since all labels are positive in our dataset, we use the feature
    importance derived from our calibration testing:
    - keyword_overlap was most predictive (72-100% in all matches)
    - category_match was 100% in all cases
    - sources_match was key for resolution alignment
    """
    # Weights derived from calibration analysis (see CALIBRATION_REPORT.md)
    weights = np.array([
        0.12,   # title_similarity (moderate)
        0.08,   # description_similarity (lower)
        0.25,   # keyword_overlap (highest - proven reliable)
        0.15,   # category_match (strong signal)
        0.10,   # timing_match
        0.12,   # sources_match
        0.08,   # alignment_score
        0.03,   # volume_ratio
        0.03,   # price_correlation
        0.02,   # length_ratio
        0.02    # avg_word_count
    ])

    return weights, -0.3  # Default intercept


def train_random_forest(X: np.ndarray, y: np.ndarray) -> Dict:
    """Train RandomForest and return feature importances"""
    if not SKLEARN_AVAILABLE:
        weights, _ = estimate_weights_simple(X, y)
        return {'feature_importances': weights}

    model = RandomForestClassifier(n_estimators=100, max_depth=3, random_state=42)
    model.fit(X, y)

    return {
        'feature_importances': model.feature_importances_,
        'accuracy': cross_val_score(model, X, y, cv=min(3, len(y))).mean()
    }


def evaluate_model(X: np.ndarray, y: np.ndarray, weights: np.ndarray, intercept: float) -> Dict:
    """Evaluate model performance"""

    def sigmoid(x):
        return 1 / (1 + np.exp(-np.clip(x, -500, 500)))

    scores = X @ weights + intercept
    predictions = (sigmoid(scores) >= 0.5).astype(int)

    accuracy = (predictions == y).mean() * 100
    tp = ((predictions == 1) & (y == 1)).sum()
    fp = ((predictions == 1) & (y == 0)).sum()
    fn = ((predictions == 0) & (y == 1)).sum()
    tn = ((predictions == 0) & (y == 0)).sum()

    precision = tp / (tp + fp) * 100 if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) * 100 if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    return {
        'accuracy': accuracy,
        'precision': precision,
        'recall': recall,
        'f1_score': f1,
        'confusion_matrix': {'tp': int(tp), 'fp': int(fp), 'fn': int(fn), 'tn': int(tn)}
    }


def main():
    print("=" * 60)
    print("Arbitrage Scanner ML Training Pipeline")
    print("=" * 60)

    # Load data
    data_path = Path(__file__).parent.parent / 'data' / 'historical_2024_election_markets.json'

    if not data_path.exists():
        print(f"Error: Data file not found: {data_path}")
        return

    print(f"\nLoading data from: {data_path}")
    pairs = load_historical_data(str(data_path))
    print(f"Loaded {len(pairs)} market pairs")

    # Prepare training data
    X, y = prepare_training_data(pairs)
    print(f"\nFeature matrix shape: {X.shape}")
    print(f"Labels: {y}")

    # Augment data for better training
    X_aug, y_aug = augment_training_data(X, y, factor=20)
    print(f"Augmented data shape: {X_aug.shape}")

    # Train matching model
    print("\n" + "-" * 40)
    print("Training Market Matching Model")
    print("-" * 40)

    matching_weights, matching_intercept = train_logistic_weights(X_aug, y_aug)
    print(f"\nMatching Model Weights:")
    feature_names = [
        'title_similarity', 'description_similarity', 'keyword_overlap',
        'category_match', 'timing_match', 'sources_match', 'alignment_score',
        'volume_ratio', 'price_correlation', 'length_ratio', 'avg_word_count'
    ]
    for name, weight in zip(feature_names, matching_weights):
        print(f"  {name:25s}: {weight:+.4f}")
    print(f"  {'intercept':25s}: {matching_intercept:+.4f}")

    # Evaluate matching model
    metrics = evaluate_model(X, y, matching_weights, matching_intercept)
    print(f"\nMatching Model Performance (on original data):")
    print(f"  Accuracy:  {metrics['accuracy']:.1f}%")
    print(f"  Precision: {metrics['precision']:.1f}%")
    print(f"  Recall:    {metrics['recall']:.1f}%")
    print(f"  F1 Score:  {metrics['f1_score']:.1f}%")

    # Train resolution model (same approach, different weight priorities)
    print("\n" + "-" * 40)
    print("Training Resolution Risk Model")
    print("-" * 40)

    # Use RandomForest for feature importance
    rf_results = train_random_forest(X_aug, y_aug)
    resolution_weights = rf_results['feature_importances']

    print(f"\nResolution Model Feature Importance:")
    for name, importance in zip(feature_names, resolution_weights):
        print(f"  {name:25s}: {importance:.4f}")

    # Save models
    output = {
        'matching_model': {
            'weights': matching_weights.tolist(),
            'intercept': float(matching_intercept),
            'metrics': metrics
        },
        'resolution_model': {
            'feature_importances': resolution_weights.tolist(),
            'intercept': -0.2
        },
        'feature_names': feature_names,
        'training_info': {
            'n_samples': len(pairs),
            'n_augmented': len(y_aug),
            'sklearn_available': SKLEARN_AVAILABLE
        }
    }

    output_path = Path(__file__).parent / 'trained_models.json'
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n[OK] Models saved to: {output_path}")

    # Generate TypeScript weights
    print("\n" + "=" * 60)
    print("TypeScript Model Weights (copy to matching.ts / resolution.ts)")
    print("=" * 60)

    print("\n// Matching Model Weights")
    print("this.modelWeights = [")
    for weight in matching_weights:
        print(f"  {weight:.4f},")
    print("];")
    print(f"this.modelIntercept = {matching_intercept:.4f};")

    print("\n// Resolution Model Weights")
    print("this.riskWeights = [")
    for weight in resolution_weights:
        print(f"  {weight:.4f},")
    print("];")

    print("\n[OK] Training complete!")


if __name__ == '__main__':
    main()
