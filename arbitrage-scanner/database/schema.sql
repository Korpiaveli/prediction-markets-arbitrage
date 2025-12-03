-- Arbitrage Scanner PostgreSQL Schema
-- Position tracking, risk management, and execution audit trail

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- OPPORTUNITIES TABLE
-- Records detected arbitrage opportunities
-- ============================================================================
CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(255) UNIQUE NOT NULL,  -- From market pair ID
  detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,

  -- Market information
  exchange_pair VARCHAR(50) NOT NULL,  -- e.g., "KALSHI-PREDICTIT"
  market1_id VARCHAR(255) NOT NULL,
  market2_id VARCHAR(255) NOT NULL,
  market1_title TEXT NOT NULL,
  market2_title TEXT NOT NULL,

  -- Opportunity metrics
  profit_percent DECIMAL(10, 4) NOT NULL,
  profit_dollars DECIMAL(10, 2),
  total_cost DECIMAL(10, 2) NOT NULL,
  max_size DECIMAL(10, 2) NOT NULL,
  confidence DECIMAL(5, 2) NOT NULL,  -- 0-100

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'detected',  -- detected, approved, rejected, expired, executed
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opportunities_status ON opportunities(status);
CREATE INDEX idx_opportunities_detected_at ON opportunities(detected_at);
CREATE INDEX idx_opportunities_exchange_pair ON opportunities(exchange_pair);

-- ============================================================================
-- EXECUTIONS TABLE
-- Records trade execution attempts
-- ============================================================================
CREATE TABLE executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id),

  -- Execution details
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, preparing, committing, completed, failed, rolled_back
  requested_size DECIMAL(10, 2) NOT NULL,
  actual_size DECIMAL(10, 2),

  -- Timing
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  committed_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,

  -- Results
  exchange1_order_id VARCHAR(255),
  exchange2_order_id VARCHAR(255),
  error_message TEXT,
  rollback_reason TEXT,

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_executions_opportunity ON executions(opportunity_id);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_started_at ON executions(started_at);

-- ============================================================================
-- EXECUTION_LEGS TABLE
-- Individual orders on each exchange (granular tracking)
-- ============================================================================
CREATE TABLE execution_legs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES executions(id),

  -- Exchange details
  exchange VARCHAR(50) NOT NULL,
  market_id VARCHAR(255) NOT NULL,
  order_id VARCHAR(255) NOT NULL,

  -- Order details
  side VARCHAR(10) NOT NULL,  -- YES, NO
  requested_size DECIMAL(10, 2) NOT NULL,
  filled_size DECIMAL(10, 2),
  requested_price DECIMAL(10, 4) NOT NULL,
  filled_price DECIMAL(10, 4),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, submitted, filled, partial, cancelled, failed
  filled_at TIMESTAMP,
  cancelled_at TIMESTAMP,

  -- Fees
  fee_amount DECIMAL(10, 4),
  fee_percent DECIMAL(5, 4),

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_execution_legs_execution ON execution_legs(execution_id);
CREATE INDEX idx_execution_legs_exchange ON execution_legs(exchange);
CREATE INDEX idx_execution_legs_order_id ON execution_legs(order_id);

-- ============================================================================
-- POSITIONS TABLE
-- Open positions (both legs filled, awaiting resolution)
-- ============================================================================
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES executions(id),

  -- Position details
  exchange1 VARCHAR(50) NOT NULL,
  exchange2 VARCHAR(50) NOT NULL,
  exchange1_market_id VARCHAR(255) NOT NULL,
  exchange2_market_id VARCHAR(255) NOT NULL,

  -- Entry details
  exchange1_entry_price DECIMAL(10, 4) NOT NULL,
  exchange2_entry_price DECIMAL(10, 4) NOT NULL,
  position_size DECIMAL(10, 2) NOT NULL,
  total_cost DECIMAL(10, 2) NOT NULL,
  expected_payout DECIMAL(10, 2) NOT NULL,
  expected_profit DECIMAL(10, 2) NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'open',  -- open, resolving, resolved, disputed
  opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,

  -- Resolution details
  exchange1_resolution VARCHAR(10),  -- YES, NO
  exchange2_resolution VARCHAR(10),
  exchange1_payout DECIMAL(10, 2),
  exchange2_payout DECIMAL(10, 2),
  actual_profit DECIMAL(10, 2),

  -- Risk flags
  divergent_resolution BOOLEAN DEFAULT FALSE,
  requires_review BOOLEAN DEFAULT FALSE,
  notes TEXT,

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_opened_at ON positions(opened_at);
CREATE INDEX idx_positions_execution ON positions(execution_id);

-- ============================================================================
-- CAPITAL_STATUS TABLE
-- Current capital allocation (single-row table)
-- ============================================================================
CREATE TABLE capital_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  total_capital DECIMAL(10, 2) NOT NULL,
  available_capital DECIMAL(10, 2) NOT NULL,
  allocated_capital DECIMAL(10, 2) NOT NULL DEFAULT 0,
  reserved_capital DECIMAL(10, 2) NOT NULL DEFAULT 0,

  -- Stats
  total_positions INTEGER NOT NULL DEFAULT 0,
  total_profit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize with default capital
INSERT INTO capital_status (total_capital, available_capital)
VALUES (10000.00, 10000.00);

-- ============================================================================
-- DAILY_TRADES TABLE
-- Daily summary statistics
-- ============================================================================
CREATE TABLE daily_trades (
  trade_date DATE PRIMARY KEY,
  trades_count INTEGER NOT NULL DEFAULT 0,
  capital_deployed DECIMAL(10, 2) NOT NULL DEFAULT 0,
  profit_realized DECIMAL(10, 2) NOT NULL DEFAULT 0,
  positions_opened INTEGER NOT NULL DEFAULT 0,
  positions_closed INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_daily_trades_date ON daily_trades(trade_date);

-- ============================================================================
-- AUDIT_LOG TABLE
-- Comprehensive audit trail for all actions
-- ============================================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  action VARCHAR(100) NOT NULL,  -- e.g., "opportunity_detected", "execution_started"
  entity_type VARCHAR(50) NOT NULL,  -- e.g., "opportunity", "execution", "position"
  entity_id UUID NOT NULL,
  user_id VARCHAR(255),  -- "system" or user identifier

  -- Details
  details JSONB,
  ip_address INET,
  user_agent TEXT,

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_opportunities_updated_at BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_executions_updated_at BEFORE UPDATE ON executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_execution_legs_updated_at BEFORE UPDATE ON execution_legs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_capital_status_updated_at BEFORE UPDATE ON capital_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active opportunities view
CREATE VIEW v_active_opportunities AS
SELECT
  o.*,
  CASE
    WHEN o.expires_at < NOW() THEN 'expired'
    ELSE o.status
  END as effective_status,
  EXTRACT(EPOCH FROM (o.expires_at - NOW())) as seconds_remaining
FROM opportunities o
WHERE o.status IN ('detected', 'approved')
  AND o.expires_at > NOW();

-- Position summary view
CREATE VIEW v_position_summary AS
SELECT
  p.*,
  e.exchange1_order_id,
  e.exchange2_order_id,
  EXTRACT(EPOCH FROM (NOW() - p.opened_at)) / 86400 as days_open
FROM positions p
JOIN executions e ON e.id = p.execution_id
WHERE p.status = 'open';

-- Daily performance view
CREATE VIEW v_daily_performance AS
SELECT
  d.trade_date,
  d.trades_count,
  d.capital_deployed,
  d.profit_realized,
  d.positions_opened,
  d.positions_closed,
  CASE
    WHEN d.capital_deployed > 0
    THEN (d.profit_realized / d.capital_deployed) * 100
    ELSE 0
  END as roi_percent
FROM daily_trades d
ORDER BY d.trade_date DESC;
