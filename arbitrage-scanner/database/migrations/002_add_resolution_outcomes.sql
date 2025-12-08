-- Migration 002: Add Resolution Outcome Tracking
-- Purpose: Track predicted vs actual resolution outcomes for calibration

-- ============================================================================
-- RESOLUTION_PREDICTIONS TABLE
-- Records predicted resolution scores at position open time
-- ============================================================================
CREATE TABLE IF NOT EXISTS resolution_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  position_id UUID NOT NULL REFERENCES positions(id),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id),

  -- Prediction details (at open time)
  predicted_score INTEGER NOT NULL,  -- 0-100 resolution alignment score
  predicted_level VARCHAR(20) NOT NULL,  -- high, medium, low, critical
  sources_match BOOLEAN NOT NULL,
  timing_match BOOLEAN NOT NULL,
  conditions_match BOOLEAN NOT NULL,
  temporal_distance INTEGER,  -- Days between resolution dates, if known

  -- Market info
  exchange_pair VARCHAR(50) NOT NULL,
  market1_id VARCHAR(255) NOT NULL,
  market2_id VARCHAR(255) NOT NULL,

  -- Risks and warnings at prediction time
  risks JSONB,
  warnings JSONB,
  polymarket_5050_risk BOOLEAN DEFAULT FALSE,

  -- Timestamps
  predicted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resolution_predictions_position ON resolution_predictions(position_id);
CREATE INDEX idx_resolution_predictions_opportunity ON resolution_predictions(opportunity_id);
CREATE INDEX idx_resolution_predictions_score ON resolution_predictions(predicted_score);
CREATE INDEX idx_resolution_predictions_predicted_at ON resolution_predictions(predicted_at);

-- ============================================================================
-- RESOLUTION_OUTCOMES TABLE
-- Records actual resolution outcomes at position close time
-- ============================================================================
CREATE TABLE IF NOT EXISTS resolution_outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id UUID NOT NULL REFERENCES resolution_predictions(id),
  position_id UUID NOT NULL REFERENCES positions(id),

  -- Actual outcomes
  resolved_same BOOLEAN NOT NULL,  -- Did both markets resolve the same way?
  exchange1_outcome VARCHAR(10) NOT NULL,  -- YES, NO, VOID
  exchange2_outcome VARCHAR(10) NOT NULL,

  -- Resolution details
  resolution_reason VARCHAR(50),  -- standard, 50_50, disputed, voided, early_close
  outcome_notes TEXT,

  -- Financial outcome
  actual_profit DECIMAL(10, 2),
  expected_profit DECIMAL(10, 2),
  profit_deviation DECIMAL(10, 2),  -- actual - expected

  -- Calibration metrics
  prediction_accurate BOOLEAN NOT NULL,  -- Did predicted alignment match actual?

  -- Timestamps
  resolved_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resolution_outcomes_prediction ON resolution_outcomes(prediction_id);
CREATE INDEX idx_resolution_outcomes_position ON resolution_outcomes(position_id);
CREATE INDEX idx_resolution_outcomes_resolved_same ON resolution_outcomes(resolved_same);
CREATE INDEX idx_resolution_outcomes_resolved_at ON resolution_outcomes(resolved_at);
CREATE INDEX idx_resolution_outcomes_accurate ON resolution_outcomes(prediction_accurate);

-- ============================================================================
-- CALIBRATION VIEW
-- Aggregated accuracy by score bucket for model calibration
-- ============================================================================
CREATE VIEW v_resolution_calibration AS
SELECT
  CASE
    WHEN p.predicted_score >= 85 THEN '85-100 (High)'
    WHEN p.predicted_score >= 70 THEN '70-84 (Medium-High)'
    WHEN p.predicted_score >= 65 THEN '65-69 (Medium)'
    WHEN p.predicted_score >= 50 THEN '50-64 (Low)'
    ELSE '0-49 (Critical)'
  END as score_bucket,
  COUNT(*) as total_predictions,
  SUM(CASE WHEN o.resolved_same THEN 1 ELSE 0 END) as resolved_same_count,
  SUM(CASE WHEN o.prediction_accurate THEN 1 ELSE 0 END) as accurate_count,
  ROUND(100.0 * SUM(CASE WHEN o.resolved_same THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as same_resolution_rate,
  ROUND(100.0 * SUM(CASE WHEN o.prediction_accurate THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as accuracy_rate,
  ROUND(AVG(p.predicted_score), 2) as avg_predicted_score,
  ROUND(AVG(o.profit_deviation), 2) as avg_profit_deviation,
  MIN(o.resolved_at) as first_resolution,
  MAX(o.resolved_at) as last_resolution
FROM resolution_predictions p
JOIN resolution_outcomes o ON o.prediction_id = p.id
GROUP BY score_bucket
ORDER BY score_bucket DESC;

-- ============================================================================
-- DETAILED CALIBRATION VIEW
-- Per-exchange-pair accuracy breakdown
-- ============================================================================
CREATE VIEW v_resolution_calibration_by_exchange AS
SELECT
  p.exchange_pair,
  CASE
    WHEN p.predicted_score >= 85 THEN '85-100'
    WHEN p.predicted_score >= 70 THEN '70-84'
    WHEN p.predicted_score >= 65 THEN '65-69'
    WHEN p.predicted_score >= 50 THEN '50-64'
    ELSE '0-49'
  END as score_bucket,
  COUNT(*) as total,
  ROUND(100.0 * SUM(CASE WHEN o.resolved_same THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as same_rate,
  ROUND(100.0 * SUM(CASE WHEN o.prediction_accurate THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as accuracy_rate
FROM resolution_predictions p
JOIN resolution_outcomes o ON o.prediction_id = p.id
GROUP BY p.exchange_pair, score_bucket
ORDER BY p.exchange_pair, score_bucket DESC;

-- ============================================================================
-- MONTHLY TREND VIEW
-- Track calibration accuracy over time
-- ============================================================================
CREATE VIEW v_resolution_monthly_trend AS
SELECT
  DATE_TRUNC('month', o.resolved_at) as month,
  COUNT(*) as total_resolutions,
  ROUND(100.0 * SUM(CASE WHEN o.resolved_same THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as same_rate,
  ROUND(AVG(p.predicted_score), 2) as avg_predicted_score,
  ROUND(AVG(o.actual_profit), 2) as avg_profit
FROM resolution_predictions p
JOIN resolution_outcomes o ON o.prediction_id = p.id
GROUP BY DATE_TRUNC('month', o.resolved_at)
ORDER BY month DESC;

-- ============================================================================
-- ADD resolution_score COLUMN TO positions TABLE
-- ============================================================================
ALTER TABLE positions ADD COLUMN IF NOT EXISTS resolution_score INTEGER;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS resolution_level VARCHAR(20);

-- ============================================================================
-- UPDATE TRIGGER for resolution_outcomes
-- ============================================================================
CREATE TRIGGER update_resolution_outcomes_updated_at BEFORE UPDATE ON resolution_outcomes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
