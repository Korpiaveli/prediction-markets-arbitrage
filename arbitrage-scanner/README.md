# Arbitrage Scanner

Production-ready cross-exchange arbitrage detection system for Kalshi and Polymarket prediction markets.

## Features

### Core Capabilities
- ✅ **100% Accurate Calculations** - Decimal precision financial math
- ✅ **Real-Time Monitoring** - WebSocket feeds with <2s detection
- ✅ **ML-Enhanced Matching** - 80% accuracy market pair detection
- ✅ **Resolution Risk Analysis** - Source alignment scoring
- ✅ **Historical Pattern Analysis** - Temporal & category insights
- ✅ **Liquidity Depth Analysis** - Execution feasibility assessment
- ✅ **Backtesting Engine** - Strategy validation with risk metrics
- ✅ **Market Correlation Detection** - Find hidden opportunities

### Architecture
- **Modular Design** - 8 independent npm packages
- **Plugin System** - Extensible exchanges, calculators, storage
- **Type-Safe** - Full TypeScript with strict mode
- **Production Ready** - Error handling, logging, graceful shutdown

## Quick Start

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run scanner (mock mode for testing)
npm run dev scan --mode mock --once

# List available markets
npm run dev list-markets --exchange kalshi --limit 10

# Match markets between exchanges
npm run dev match-markets --min-confidence 60

# Analyze specific pair
npm run dev analyze <kalshi-id> <poly-id> --mode live

# View configuration
npm run dev config

# Run backtest on historical data
npm run dev backtest --capital 10000 --days 30

# Analyze historical patterns
npm run dev patterns --days 30

# View historical opportunities
npm run dev history --limit 20
```

## CLI Commands

### `scan` - Main Scanner
Continuously scan for arbitrage opportunities.

```bash
npm run dev scan [options]

Options:
  -m, --mode <mode>                Exchange mode: mock, test, live (default: "mock")
  -i, --interval <ms>              Scan interval in milliseconds (default: "5000")
  -o, --once                       Run single scan and exit
  --min-profit <percent>           Minimum profit percentage (default: "0.5")
  --data-dir <path>                Data directory for storage (default: "./data")
  --collect-resolution-data        Collect resolution analysis data
```

**Examples:**
```bash
# Single scan in mock mode
npm run dev scan --mode mock --once

# Continuous scanning with live data
npm run dev scan --mode live --interval 10000 --min-profit 2

# Collect resolution data for calibration
npm run dev scan --collect-resolution-data
```

### `list-markets` - Market Explorer
List available markets from exchanges.

```bash
npm run dev list-markets [options]

Options:
  -e, --exchange <name>  Exchange name: kalshi, polymarket, both (default: "both")
  -l, --limit <n>        Number of markets to show (default: "20")
```

### `match-markets` - Intelligent Matching
Find matching market pairs using ML-enhanced matching.

```bash
npm run dev match-markets [options]

Options:
  --min-confidence <n>    Minimum confidence score (default: "40")
  --include-low           Include low confidence matches
  --include-uncertain     Include uncertain matches
  --save <file>           Save results to JSON file
```

### `analyze` - Pair Analysis
Analyze a specific market pair in detail.

```bash
npm run dev analyze <kalshi-id> <poly-id> [options]

Options:
  -m, --mode <mode>  Exchange mode: mock, test, live (default: "mock")
```

### `backtest` - Strategy Validation
Run backtests on historical data to validate strategies.

```bash
npm run dev backtest [options]

Options:
  --data-dir <path>       Data directory (default: "./data")
  --days <n>              Number of days to backtest
  --capital <n>           Initial capital (default: "10000")
  --max-position <n>      Max position size (default: "2000")
  --min-profit <n>        Min profit % (default: "2")
  --slippage <model>      Slippage model: conservative, realistic, optimistic (default: "realistic")
  --delay <s>             Execution delay in seconds (default: "5")
```

**Metrics Provided:**
- Win/loss rates and profit factors
- Sharpe ratio and max drawdown
- Total returns and fees paid
- Trade-by-trade analysis
- Automated insights

### `patterns` - Historical Analysis
Analyze temporal and categorical patterns in arbitrage data.

```bash
npm run dev patterns [options]

Options:
  --data-dir <path>  Data directory (default: "./data")
  --days <n>         Number of days to analyze
  --save <file>      Save analysis to JSON file
```

**Analysis Includes:**
- Best times to scan (hourly/daily patterns)
- Most profitable categories
- Profit distribution percentiles
- Duration patterns and decay rates
- Automated insights

### `history` - View Past Opportunities
View historical arbitrage opportunities from storage.

```bash
npm run dev history [options]

Options:
  --data-dir <path>  Data directory (default: "./data")
  -l, --limit <n>    Number of records to show (default: "10")
```

### `config` - Configuration Display
Display current configuration and settings.

```bash
npm run dev config [--path <path>]
```

## Package Structure

```
arbitrage-scanner/
├── packages/                    # Core packages
│   ├── @arb/core/              # Interfaces and types
│   ├── @arb/math/              # Calculation engine (decimal precision)
│   ├── @arb/exchanges/         # Exchange adapters (Kalshi, Polymarket)
│   ├── @arb/scanner/           # Orchestration engine
│   ├── @arb/storage/           # JSON file storage
│   ├── @arb/ml/                # ML & Intelligence layer
│   │   ├── features.ts         # Feature extraction
│   │   ├── matching.ts         # Market matching predictor
│   │   ├── resolution.ts       # Resolution risk predictor
│   │   ├── service.ts          # Model service
│   │   ├── patterns.ts         # Historical pattern analysis
│   │   ├── liquidity.ts        # Liquidity depth analysis
│   │   ├── backtest.ts         # Backtesting engine
│   │   └── correlation.ts      # Market correlation detection
│   └── @arb/realtime/          # Real-time infrastructure
│       ├── websocket/          # WebSocket managers
│       ├── cache/              # Redis caching
│       ├── alerts/             # Discord/Telegram alerts
│       ├── metrics/            # Performance tracking
│       └── scanner/            # Real-time scanner
├── apps/
│   └── cli/                    # Command-line interface
│       ├── index.ts            # Main CLI entry
│       ├── config.ts           # Configuration management
│       └── commands/           # Command implementations
│           ├── backtest.ts
│           └── patterns.ts
├── config/                     # Configuration files
│   ├── config.json             # Scanner configuration
│   └── market_map.json         # Market pair mappings
├── data/                       # Data storage
│   └── historical_*.json       # Training & historical data
├── ml_training/                # Python ML training
│   └── train_models.py         # Model training pipeline
└── scripts/                    # Utility scripts
    ├── calibrate_historical.ts # Algorithm calibration
    ├── demo_intelligence.ts    # Phase 3 demo
    └── test_ml_predictions.ts  # ML testing
```

## Configuration

### Config File Structure (`config/config.json`)

```json
{
  "exchanges": {
    "kalshi": {
      "enabled": true,
      "testMode": false,
      "apiKey": "YOUR_API_KEY",
      "apiSecret": "YOUR_API_SECRET",
      "rateLimit": {
        "maxRequests": 10,
        "perMilliseconds": 1000
      }
    },
    "polymarket": {
      "enabled": true,
      "testMode": false,
      "rateLimit": {
        "maxRequests": 10,
        "perMilliseconds": 1000
      }
    }
  },
  "scanner": {
    "scanInterval": 5000,
    "minProfitPercent": 0.5,
    "maxConcurrent": 10
  },
  "storage": {
    "dataDir": "./data",
    "prettyPrint": true
  },
  "features": {
    "enableResolutionAnalysis": true,
    "enableLiquidityAnalysis": true,
    "enableMLMatching": true
  },
  "alerts": {
    "discord": {
      "webhookUrl": "https://discord.com/api/webhooks/...",
      "minProfit": 5
    },
    "telegram": {
      "botToken": "YOUR_BOT_TOKEN",
      "chatId": "YOUR_CHAT_ID",
      "minProfit": 5
    }
  }
}
```

### Environment Variables

```bash
# Exchange API Keys
KALSHI_API_KEY=your_key
KALSHI_API_SECRET=your_secret

# Alert Webhooks
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Redis (for real-time features)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password
```

## Development

### Building
```bash
npm run build      # Build all packages
npm run clean      # Clean build artifacts
npm run typecheck  # Type checking without emit
```

### Testing
```bash
npm test                                    # Run all tests
npm test --workspace=packages/math          # Test specific package
```

### Adding a New Exchange
1. Create adapter in `packages/exchanges/src/`
2. Implement `IExchange` interface
3. Add to `createExchanges()` in CLI
4. Update market mapping configuration

## Performance

### Accuracy Metrics
- **Calculation Precision**: 100% (decimal.js)
- **Market Matching**: 80% accuracy
- **Resolution Alignment**: 80% accuracy

### Performance Targets
- **Opportunity Detection**: <2 seconds
- **Scan Frequency**: Configurable (default 5s)
- **Concurrent Pairs**: Up to 100+

## Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Core foundation with accurate calculations |
| Phase 1.5 | ✅ Complete | Validation & testing infrastructure |
| Phase 1.6 | ✅ Complete | Historical calibration (80% accuracy) |
| Phase 2 | ✅ Complete | Real-time infrastructure |
| Phase 3 | ✅ Complete | Complete intelligence layer |
| Phase 4 | 📋 Planned | Web UI & REST API |

## Contributing

See [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) for detailed development roadmap and architecture decisions.

## License

MIT

## Disclaimer

This software is for educational and research purposes. Prediction market trading carries risk. Always conduct your own research and use appropriate risk management.
