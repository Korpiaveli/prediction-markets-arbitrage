# Applications

This directory contains the production applications for the arbitrage scanner system.

## Available Applications

### 1. CLI Application (`apps/cli`)

Command-line interface for scanning and analyzing arbitrage opportunities.

**Commands**:
```bash
# Start scanning
npm run dev

# Build
npm run build

# Run production
npm start
```

**Features**:
- Real-time market scanning
- Historical data analysis
- Pattern analysis
- Backtesting
- Beautiful table output

### 2. API Server (`apps/api`)

REST API server with WebSocket support for real-time updates.

**Start the server**:
```bash
cd apps/api
npm run dev    # Development mode with auto-reload
npm start      # Production mode
```

**Environment Configuration** (`.env`):
```bash
PORT=3001
NODE_ENV=development
CORS_ORIGIN=*
ENABLE_WS=true
RATE_LIMIT_MAX=100
DATA_DIR=./data
KALSHI_API_KEY=your_key_here
```

**API Endpoints**:
- `GET /health` - Health check
- `GET /api` - API documentation
- `GET /api/opportunities` - List opportunities
- `GET /api/opportunities/:id` - Get specific opportunity
- `GET /api/opportunities/stats/summary` - Get statistics
- `GET /api/scanner/status` - Scanner status
- `POST /api/scanner/scan` - Trigger manual scan
- `GET /api/markets` - List markets
- `POST /api/backtest/run` - Run backtest
- `GET /api/config` - Get configuration
- `ws://localhost:3001/ws` - WebSocket for real-time updates

**WebSocket Messages**:
```json
// Opportunity found
{
  "type": "opportunity",
  "data": { ... }
}

// Scan complete
{
  "type": "scan:complete",
  "data": {
    "count": 5,
    "timestamp": "2025-12-01T00:00:00.000Z"
  }
}
```

### 3. Web Dashboard (`apps/web`)

Next.js real-time dashboard for monitoring arbitrage opportunities.

**Start the dashboard**:
```bash
cd apps/web
npm run dev    # Development mode
npm run build  # Production build
npm start      # Production mode
```

**Environment Configuration** (`.env`):
```bash
API_URL=http://localhost:3001
WS_URL=ws://localhost:3001/ws
```

**Features**:
- Real-time opportunity updates via WebSocket
- Statistics dashboard (total, avg profit, max profit, confidence)
- Opportunity list with filtering
- Scanner status indicator
- Trigger manual scans
- Responsive design

**Pages**:
- `/` - Dashboard home with live opportunities

## Running the Full Stack

To run the complete system:

### 1. Start the API Server
```bash
cd apps/api
npm start
```

Server starts on `http://localhost:3001`

### 2. Start the Web Dashboard
```bash
cd apps/web
npm run dev
```

Dashboard available at `http://localhost:3000`

### 3. Monitor with CLI (Optional)
```bash
cd apps/cli
npm run dev
```

## Development Workflow

### Building Everything
```bash
# From root
npm run build
```

### Installing Dependencies
```bash
# From root
npm install
```

### Running Tests
```bash
# Integration tests
npm run test:integration

# Watch mode
npm run test:integration:watch
```

## Architecture

```
┌─────────────────┐
│   Web Dashboard │  (Next.js on :3000)
│   apps/web      │
└────────┬────────┘
         │ HTTP + WebSocket
         ▼
┌─────────────────┐
│   REST API      │  (Express on :3001)
│   apps/api      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│   Scanner       │────▶│  Exchanges   │
│   @arb/scanner  │     │  (Kalshi,PM) │
└────────┬────────┘     └──────────────┘
         │
         ▼
┌─────────────────┐
│   Storage       │
│   @arb/storage  │
└─────────────────┘
```

## Production Deployment

### API Server
1. Build: `npm run build`
2. Set environment variables
3. Start: `npm start`
4. Use process manager (PM2 recommended)

### Web Dashboard
1. Build: `npm run build`
2. Start: `npm start`
3. Or deploy to Vercel/Netlify

### Recommended Stack
- **API**: Docker + PM2 on VPS or AWS EC2
- **Web**: Vercel or Netlify
- **Storage**: Upgrade to PostgreSQL for production
- **Cache**: Add Redis for performance

## Monitoring

### Health Checks
```bash
# API health
curl http://localhost:3001/health

# Scanner status
curl http://localhost:3001/api/scanner/status
```

### Logs
All applications log to console. In production, redirect to log files:
```bash
npm start 2>&1 | tee app.log
```

## Troubleshooting

### API won't start
- Check port 3001 is available
- Verify DATA_DIR exists
- Check dependencies are installed

### Dashboard can't connect
- Verify API is running
- Check API_URL and WS_URL in .env
- Check CORS settings in API

### No opportunities showing
- Run a manual scan via UI or API
- Check exchange APIs are accessible
- Verify market data is available

## Next Steps

Potential enhancements:
- [ ] Add authentication/authorization
- [ ] PostgreSQL storage adapter
- [ ] Redis caching layer
- [ ] Email/Slack alerts
- [ ] Advanced filtering and search
- [ ] Historical charts and analytics
- [ ] Export functionality (CSV/JSON)
- [ ] Mobile app
