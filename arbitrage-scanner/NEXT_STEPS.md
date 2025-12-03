# Next Steps - Arbitrage Scanner Development

**Last Updated**: December 2, 2025
**Current Branch**: `fix/cross-platform-matching`
**Status**: Quick Win Path Complete ✅

---

## ✅ Completed: Quick Win Path (Resolution Validation)

### Phase 1: Threshold Adjustment
- ✅ Lowered resolution threshold from 70 to 65 (default)
- ✅ Added configurable `--min-resolution-score` CLI option
- ✅ Updated ResolutionAnalyzer with `setMinThreshold()` method

### Phase 2: Polymarket 50-50 Detection
- ✅ Propagated `is_50_50_outcome` field from Polymarket API
- ✅ Added `polymarket5050Risk` to ResolutionAlignment
- ✅ Implemented automatic 50% position size reduction
- ✅ Added warnings when 50-50 risk detected

### Phase 4: Testing Infrastructure
- ✅ Created `resolution-analyzer.test.ts` (comprehensive test suite)
- ✅ Created `risk-manager-5050.test.ts` (50-50 detection tests)

### Trading System Foundation
- ✅ Trading interfaces (placeOrder, cancelOrder, getOrderStatus, getAccountBalance)
- ✅ ExecutionEngine with two-phase commit
- ✅ PositionMonitor with 60s polling
- ✅ AlertManager with multi-channel support
- ✅ PositionTracker for lifecycle management

---

## 🎯 Recommended Next Step: TEST THE IMPROVEMENTS

### Test Resolution Validation (15 minutes)

```bash
# Navigate to project
cd arbitrage-scanner

# 1. Match markets with new threshold
npm run match-markets -- \
  --min-confidence 40 \
  --exchanges kalshi,predictit \
  --save data/kp-matches-65.json

# 2. Scan for arbitrage with resolution filtering
npm run scan -- \
  --once \
  --min-resolution-score 65 \
  --exchanges kalshi,predictit

# 3. Test with different thresholds
npm run scan -- --once --min-resolution-score 70  # Strict (old behavior)
npm run scan -- --once --min-resolution-score 60  # Aggressive
```

### Expected Results
- **More opportunities** captured (65 vs old 70 threshold)
- **Resolution warnings** displayed in output table
- **50-50 risk alerts** when Polymarket markets detected
- **Resolution score column** shows alignment quality (0-100)

---

## 🔧 Option A: Continue Full Resolution Validation (6-7 hours)

### Phase 3: Enhanced Timing Validation (1.5 hrs)
**Goal**: Catch "Dec 31 2024" == "December 31, 2024" equivalence

**Tasks**:
- [ ] Add `parseTiming()` method to extract dates from text
- [ ] Update `checkTimingMatch()` to use date comparison (±7 day tolerance)
- [ ] Add temporal distance feature (0-1 score)

**Files**:
- `packages/math/src/resolution.ts` (lines 330-338, add method after line 172)

**Why**: Prevent false negatives from date format mismatches

---

### Phase 5: Historical Resolution Outcome Tracking (2-3 hrs)
**Goal**: Track predicted vs actual resolution alignment for calibration

**Tasks**:
- [ ] Create database migration `002_add_resolution_outcomes.sql`
- [ ] Create `ResolutionOutcomeTracker` class
- [ ] Integrate with PositionTracker (record predictions at open)
- [ ] Integrate with PositionMonitor (record actuals at close)
- [ ] Create calibration view (accuracy by score bucket)

**Files**:
- `database/migrations/002_add_resolution_outcomes.sql` (NEW)
- `packages/tracking/src/ResolutionOutcomeTracker.ts` (NEW)
- `packages/tracking/src/PositionTracker.ts` (add `resolution_score` column)
- `packages/execution/src/PositionMonitor.ts` (record actuals)

**Why**: Validate that predicted scores correlate with actual outcomes

---

### Phase 6: Real-Time Monitoring Enhancements (1 hr)
**Goal**: Enhanced position monitoring with resolution divergence alerts

**Tasks**:
- [ ] Extract resolution sources from market metadata
- [ ] Detect resolution divergence in real-time
- [ ] Send CRITICAL alerts when divergence detected
- [ ] Log outcome types (50-50, disputed, delayed)

**Files**:
- `packages/execution/src/PositionMonitor.ts` (enhance `checkResolutionDivergence`)
- `packages/alerts/src/AlertManager.ts` (add alert types)

**Why**: Early detection of resolution problems

---

## 🚀 Option B: Continue Main Trading System (8 weeks)

### Week 3: Alert Integration (Current Priority)
**Goal**: Connect AlertManager to Scanner for real-time notifications

**Tasks**:
- [ ] Integrate AlertManager with Scanner
- [ ] Configure Discord webhook (existing code ready)
- [ ] Configure Telegram bot (existing code ready)
- [ ] Set up smart routing (priority-based)
- [ ] Test multi-channel alerts

**Files**:
- `packages/scanner/src/Scanner.ts` (add AlertManager integration)
- `packages/alerts/src/AlertManager.ts` (already implemented)
- `.env` (add Discord/Telegram credentials)

---

### Week 4-5: Approval UI (Mobile PWA)
**Goal**: Human-in-loop approval workflow

**Tasks**:
- [ ] Create Next.js PWA app (`apps/approval`)
- [ ] Build review page (swipe gestures, biometric auth)
- [ ] Position size slider ($200-$1000)
- [ ] Real-time countdown timer (2 min expiration)
- [ ] Approve/Reject buttons
- [ ] Deploy to Vercel

**Stack**: Next.js, NextAuth, Tailwind, PWA

---

### Week 6: Execution Engine Refinement
**Goal**: Production-ready atomic execution

**Tasks**:
- [ ] Exchange-specific order placement testing
- [ ] Rollback procedures (handle partial fills)
- [ ] Emergency hedging logic
- [ ] Fill monitoring (polling + webhooks)

**Files**:
- `packages/execution/src/ExecutionEngine.ts` (already scaffolded)
- Exchange adapters (trading methods already implemented)

---

### Week 7: Position Management
**Goal**: Track open positions to settlement

**Tasks**:
- [ ] Set up PostgreSQL database (local or Railway)
- [ ] Run migrations (PositionTracker schema)
- [ ] Test position lifecycle (open → monitor → close)
- [ ] Verify capital allocation accuracy

**Files**:
- `packages/tracking/src/PositionTracker.ts` (already implemented)
- `database/migrations/001_initial_schema.sql` (create this)

---

### Week 8: Testing & Deployment
**Goal**: Paper trading mode + gradual rollout

**Tasks**:
- [ ] Implement paper trading mode (no real orders)
- [ ] Test 6 critical scenarios (happy path, rejection, timeout, partial fill, etc.)
- [ ] 2 weeks paper trading ($0 capital)
- [ ] Week 1 live: $100-$200 positions
- [ ] Week 2 live: $500-$1000 positions

---

## 📊 Testing Commands Reference

```bash
# Run all tests
npm test

# Run resolution analyzer tests only
npm test -- packages/math/src/__tests__/resolution-analyzer.test.ts

# Run risk manager 50-50 tests only
npm test -- packages/tracking/src/__tests__/risk-manager-5050.test.ts

# Build all packages
npm run build:packages

# Build with verification
npm run build

# Match markets (various configurations)
npm run match-markets -- --min-confidence 60 --exchanges kalshi,polymarket
npm run match-markets -- --all-exchanges --include-low
npm run match-markets -- --categories politics --exclude-categories sports

# Scan with resolution filtering
npm run scan -- --once --min-resolution-score 65
npm run scan -- --once --collect-resolution-data  # Disable filtering, collect data
```

---

## 🎓 Key Implementation Details

### Resolution Score Thresholds
- **85-100**: High confidence (green) - Safe to trade
- **65-84**: Medium confidence (yellow) - Tradeable with warnings
- **50-64**: Low confidence (red) - Blocked by default
- **<50**: Critical (bold red) - Always blocked

### Polymarket 50-50 Risk
- Detected via `is_50_50_outcome` field in API response
- Automatically reduces position size by 50%
- Applied AFTER capital/liquidity reductions
- Blocks trade if reduced size < minimum ($200)

### Resolution Alignment Scoring
- Starts at 100 points
- -40 points: Different sources (CRITICAL)
- -20 points: Different timing
- -15 points: Different conditions
- -15 points: Strict vs flexible standards
- -10 points: Missing criteria (each)
- -5 points: Polymarket 50-50 detected

---

## 📁 Key Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `packages/math/src/resolution.ts` | Resolution analysis & scoring | ✅ Updated |
| `packages/tracking/src/RiskManager.ts` | Position sizing & validation | ✅ Updated |
| `packages/scanner/src/Scanner.ts` | Opportunity detection | ✅ Updated |
| `packages/execution/src/ExecutionEngine.ts` | Atomic order execution | ✅ Scaffolded |
| `packages/execution/src/PositionMonitor.ts` | 60s position monitoring | ✅ Implemented |
| `packages/alerts/src/AlertManager.ts` | Multi-channel alerts | ✅ Implemented |
| `packages/tracking/src/PositionTracker.ts` | Position lifecycle | ✅ Implemented |
| `apps/cli/src/index.ts` | CLI interface | ✅ Updated |

---

## 💡 Decision Points

### If you see good matches with 65 threshold:
→ **Proceed to Option B** (trading system)

### If you see false positives from date mismatches:
→ **Implement Phase 3** (timing validation)

### If you want to validate scoring accuracy:
→ **Implement Phase 5** (historical tracking)

---

## 🐛 Known Limitations

1. **No remote repository configured** - Push will fail until remote added
2. **Web app build fails** - React/styled-jsx error (unrelated to our changes)
3. **Daily deployment tracking** - Stubbed (returns 0, needs DB)
4. **Resolution source extraction** - Basic pattern matching (could be enhanced)

---

## 📞 Support

- **Plan File**: `~/.claude/plans/virtual-frolicking-tiger.md`
- **Test Coverage**: Resolution analyzer, RiskManager 50-50 detection
- **Documentation**: This file + inline code comments

**Ready to test!** Start with the commands above and assess results before proceeding to Option A or B.
