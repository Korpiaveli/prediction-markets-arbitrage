# Historical Data API Research Report
**Date**: December 1, 2025
**Purpose**: Assess historical data availability for ROI backtesting on Kalshi vs PredictIt markets

---

## Executive Summary

✅ **Kalshi**: Full historical API support with trades and candlestick data
❌ **PredictIt**: No historical API - must use CSV downloads from website

**Recommendation**: Implement Kalshi historical data collection for backtesting. For PredictIt, either:
1. Continue with live data collection only
2. Manually download CSV files for specific markets
3. Focus backtest analysis on Kalshi-only opportunities

---

## Kalshi Historical Data API

### Available Endpoints ✅

#### 1. **Get Trades** (Implemented)
- **Endpoint**: `GET /markets/trades`
- **Purpose**: Retrieve completed transaction history
- **Parameters**:
  - `ticker` (required): Market ticker
  - `limit`: Number of trades (default: 100)
  - `cursor`: For pagination
  - `min_ts`: Minimum timestamp (Unix seconds)
  - `max_ts`: Maximum timestamp (Unix seconds)

**Response Structure**:
```json
{
  "cursor": "pagination_token",
  "trades": [
    {
      "trade_id": "uuid",
      "ticker": "MARKET-TICKER",
      "created_time": "2025-12-01T22:09:51.91698Z",
      "count": 117,
      "yes_price": 4,
      "no_price": 96,
      "yes_price_dollars": "0.0400",
      "no_price_dollars": "0.9600",
      "price": 0.04,
      "taker_side": "yes"
    }
  ]
}
```

**Implementation Status**: ✅ Implemented in `KalshiAdapter.getHistoricalTrades()`

#### 2. **Get Market Candlesticks**
- **Endpoint**: `GET /series/{series_ticker}/markets/{ticker}/candlesticks`
- **Purpose**: Time-series OHLC (Open, High, Low, Close) price data
- **Parameters**:
  - `period_interval`: `1` (1-minute), `60` (1-hour), or `1440` (1-day)
  - `start_ts`: Start timestamp
  - `end_ts`: End timestamp
- **Use Case**: Price charts, trend analysis, backtesting entry/exit prices

**Implementation Status**: ⏳ Not yet implemented (available if needed)

### API Characteristics

| Feature | Support |
|---------|---------|
| Historical Trades | ✅ Yes |
| Candlestick Data | ✅ Yes (1m, 1h, 1d) |
| Pagination | ✅ Cursor-based |
| Time Filtering | ✅ min_ts / max_ts |
| Rate Limits | 10/sec, 200/min |
| Authentication | ❌ Not required (public endpoints) |

### Backtesting Capabilities ✅

With Kalshi's API, we can:
- Fetch complete trade history for any market
- Reconstruct price movements over time
- Analyze entry/exit prices with 1-minute granularity
- Calculate actual fill prices from historical trades
- Measure market impact and slippage
- Track volume patterns throughout the day

---

## PredictIt Historical Data

### API Limitations ❌

**Status**: PredictIt's public API does **NOT** support historical data.

| Feature | Support |
|---------|---------|
| Historical Trades | ❌ No |
| Historical Prices | ❌ No |
| Candlestick Data | ❌ No |
| API Update Frequency | Every 60 seconds (live only) |

### Live API Only

**Endpoint**: `https://www.predictit.org/api/marketdata/all/`

**Data Available**:
- Current best buy/sell prices
- Last trade price
- Last close price (previous day)
- ⚠️ **No** historical price series
- ⚠️ **No** trade history

### Alternative: CSV Downloads

Historical price data is available via **manual CSV downloads** from PredictIt's website:
- Navigate to specific contract page
- Download CSV file with price history
- Parse CSV programmatically

**Limitations**:
- Manual process (not programmatic)
- Requires individual downloads per contract
- No API for bulk historical access
- License: Non-commercial use only, must attribute PredictIt

---

## Implementation Status

### Kalshi ✅ COMPLETE

**File**: `packages/exchanges/src/kalshi/KalshiAdapter.ts`

```typescript
async getHistoricalTrades(marketId: string, options?: {
  limit?: number;
  cursor?: string;
  minTimestamp?: Date;
  maxTimestamp?: Date;
}): Promise<{trades: any[], cursor?: string}>
```

**Features**:
- Cursor-based pagination for large datasets
- Time-range filtering
- Configurable result limits
- Integrated with rate limiting queue

### PredictIt ❌ NOT SUPPORTED

**File**: `packages/exchanges/src/predictit/PredictItAdapter.ts`

```typescript
/**
 * PredictIt does NOT support historical data via API.
 * Historical prices must be downloaded as CSV files from the website.
 * API only provides live data (updated every 60 seconds).
 */
getHistoricalTrades(): Promise<{trades: any[], cursor?: string}> {
  throw new Error('PredictIt does not support historical data via API. Download CSV files from predictit.org website.');
}
```

---

## Backtesting Implications

### What We Can Do ✅

1. **Live Data Collection** (Both exchanges)
   - Continuous scanner running (30s intervals)
   - Collecting Kalshi-PredictIt opportunities
   - Building historical dataset from live scans
   - Storage location: `./data/opportunities.json`

2. **Kalshi-Only Backtesting** (Historical API)
   - Fetch historical trades for matched markets
   - Reconstruct price movements
   - Simulate arbitrage execution
   - Calculate ROI with realistic slippage/fees

3. **Kalshi-Polymarket Backtesting** (Hybrid)
   - Kalshi: Historical API
   - Polymarket: Historical available via Gamma API
   - Cross-exchange opportunity backtesting

### What We Cannot Do ❌

1. **Full Kalshi-PredictIt Historical ROI**
   - PredictIt lacks historical API
   - Cannot simulate historical arbitrage without both sides
   - Would need manual CSV collection for specific contracts

2. **Automated Historical Backfill**
   - Cannot programmatically retrieve pre-existing PredictIt data
   - Must rely on prospective data collection (live scans going forward)

---

## Recommendations

### Option A: Focus on Live Data Collection (CURRENT APPROACH ✅)
- **Status**: Scanner running (Kalshi-PredictIt, 30s intervals)
- **Timeline**: Weeks/months to build meaningful dataset
- **Pros**: Most realistic, captures actual market conditions
- **Cons**: Slow, no immediate backtesting

### Option B: Implement Kalshi Historical Backtesting
- **Implementation**: Add CLI command to fetch Kalshi historical trades
- **Timeline**: 2-3 hours
- **Pros**: Immediate backtesting on Kalshi markets
- **Cons**: Only one side of Kalshi-PredictIt arbitrage

### Option C: Manual PredictIt CSV Collection
- **Process**: Download CSVs for 8 matched markets
- **Timeline**: 1-2 hours manual work
- **Pros**: Can backtest specific Kalshi-PredictIt pairs
- **Cons**: Not scalable, manual effort

### Option D: Hybrid Approach
- **Phase 1**: Continue live data collection (Option A)
- **Phase 2**: Implement Kalshi historical (Option B)
- **Phase 3**: Add CSV parser for selective PredictIt data (Option C)
- **Timeline**: Incremental improvement over 1-2 weeks

---

## Next Steps

1. ✅ **Complete** - Live scanner running for Kalshi-PredictIt
2. ✅ **Complete** - Historical API research and implementation
3. ⏳ **Pending** - Add CLI command: `arb-scan fetch-historical --exchange kalshi --market TICKER --days 30`
4. ⏳ **Pending** - Modify backtest engine to use historical trade data
5. ⏳ **Pending** - Test historical backtesting on Kalshi markets

---

## API Reference Links

### Kalshi
- [Quick Start: Market Data](https://docs.kalshi.com/getting_started/quick_start_market_data)
- [Get Markets API](https://docs.kalshi.com/api-reference/market/get-markets)
- [Kalshi API Guide](https://zuplo.com/blog/2025/04/02/kalshi-api)

### PredictIt
- [API Documentation](https://predictit.freshdesk.com/support/solutions/articles/12000001878-does-predictit-make-market-data-available-via-an-api-)
- [rpredictit R Package](https://danielkovtun.github.io/rpredictit/)

---

*Research completed December 1, 2025 | Scanner: Running (ID 838f91) | Historical methods: Implemented*
