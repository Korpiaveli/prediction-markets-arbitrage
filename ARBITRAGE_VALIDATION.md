# Arbitrage Validation Research
**Date:** November 17, 2025
**Phase:** 1.6 Priority 2 - Reality Check

## Executive Summary

✅ **ARBITRAGE OPPORTUNITIES CONFIRMED**

Cross-platform arbitrage between Kalshi and Polymarket is **real, profitable, and actively exploited** by traders.

## Key Findings

### 1. Market Size & Profitability
- **$40M+ in risk-free profits** extracted since 2024 (Yahoo Finance)
- **Typical profit margins**: 1%-2.5% per trade
- **Position sizes**: Several thousand dollars per opportunity
- **Platform volume**: Polymarket hit $9B cumulative volume, $2.63B in November 2024 alone

### 2. Concrete Example (Current as of research)

**Bitcoin National Reserve Market:**
- Polymarket: 51% YES
- Kalshi: 37% YES (63% NO)
- **Arbitrage spread**: YES(51%) + NO(63%) = 114% > 100%
- **Profit potential**: ~14% before fees

This is a **pure arbitrage** - guaranteed profit regardless of outcome.

### 3. Why Price Differences Persist

Different platforms have different characteristics:
- **Kalshi**: US-regulated, fiat currency, strict resolution criteria
- **Polymarket**: Global, crypto-based, more flexible resolution

**Resolution Criteria Differences:**
- Kalshi: Only accepts White House or NYT as authoritative sources
- Polymarket: "We'll know it when we see it" approach
- **Risk**: Markets on "same" event might resolve differently

### 4. Market Categories

**Active Markets (Both Platforms):**
- Politics (presidential elections, policy decisions)
- Economics (inflation, Fed decisions, Bitcoin/crypto)
- Sports (NFL, NBA - current example: NFL markets on Kalshi)
- Current events

**Overlap Potential:**
- Political events (high volume, significant spreads)
- Economic indicators (different interpretations)
- Major sports events (timing sensitive)

### 5. Trader Behavior

Platforms **do NOT ban** arbitrage traders - this is considered market efficiency.

Typical strategy:
1. Buy underpriced contract on Platform A
2. Sell overpriced contract on Platform B
3. Lock in profit when prices converge or at resolution

## Critical Risks Identified

### Resolution Risk ⚠️
**Most Important Finding:**

Even if two markets have identical questions, they may resolve differently due to:
- Different resolution sources
- Different interpretation standards
- Different timing requirements

**Example Impact:**
- Bitcoin Reserve market has 14% spread
- Part of that spread is "resolution risk premium"
- Not all of the spread is free arbitrage - some compensates for resolution uncertainty

### Other Risks
1. **Timing Risk**: Markets close at different times
2. **Liquidity Risk**: Slippage when placing large orders
3. **Fee Structure**: Different fee models (Kalshi per-contract, Polymarket profit-based)
4. **Capital Efficiency**: Need capital on both platforms simultaneously

## Implications for Our Project

### ✅ Opportunities Exist
- Real, significant arbitrage opportunities confirmed
- Active trader community already exploiting them
- Multiple market categories to target

### ⚠️ Must Address Resolution Risk
Our system MUST:
1. Parse resolution criteria carefully
2. Compare resolution sources between platforms
3. Flag markets with different resolution standards
4. Calculate "resolution risk discount" into profit estimates
5. Only flag opportunities where resolution criteria align

### 📊 Expected Performance
- **Frequency**: Opportunities exist regularly (especially during major events)
- **Size**: 1%-2.5% typical, occasionally larger (14%+ rare but possible)
- **Volume**: Thousands per trade possible
- **Competition**: Other arbitrageurs exist, so speed matters

## Next Steps

### Phase 1.6 Priority 2: API Integration
Now that opportunities are confirmed, proceed with:

1. **Kalshi API Integration**
   - Endpoint: https://api.elections.kalshi.com/trade-api/v2
   - Markets endpoint: `/markets?limit=100&status=open`
   - No authentication required for market data

2. **Polymarket CLOB API Integration**
   - Endpoint: https://clob.polymarket.com
   - Markets endpoint: `/markets`
   - WebSocket: wss://ws-subscriptions-clob.polymarket.com/ws/

3. **Market Matching Algorithm**
   - Parse market questions for similarity
   - Extract resolution criteria
   - Compare resolution sources
   - Flag resolution risk

4. **Enhanced Validation**
   - Parse resolution criteria from both platforms
   - Calculate "resolution alignment score"
   - Only recommend trades with high alignment (>90%)

## References

- Yahoo Finance: "$40M+ in risk-free profits extracted since 2024"
- Monad Blog: "Prediction Markets Cannot Agree on the Truth"
- Bet Metrics Lab: "Prediction Market Arbitrage Betting"
- Sports-Arbitrage: "Polymarket vs Kalshi Comparison"
- Kalshi News: "Arbitrage" article

## Validation Status

- ✅ Reality Check Complete
- ✅ Opportunities Confirmed
- ✅ Risks Identified
- 📋 Ready for API Integration
