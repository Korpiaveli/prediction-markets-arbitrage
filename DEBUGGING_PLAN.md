# UI Debugging Plan

**Date**: December 1, 2025
**Status**: In Progress

## Issues Identified

### 1. Division by Zero - NaN Display ⚠️
**File**: `apps/web/src/components/StatsCards.tsx:35`
**Error**: `((stats.validCount / stats.total) * 100)` produces NaN when total = 0
**Fix**: Add null checking and handle zero case
**Priority**: HIGH

### 2. WebSocket Connection Failing 🔴
**File**: `apps/web/src/lib/useWebSocket.ts`
**Error**: WebSocket error events, connection not established
**Potential Causes**:
  - Environment variable `WS_URL` not accessible in client components
  - WebSocket server not handling connections properly
  - CORS issues with WebSocket upgrade
**Fix**:
  - Use hardcoded localhost for development
  - Add reconnection logic
  - Better error messaging
**Priority**: CRITICAL

### 3. TypeError: Cannot read properties of undefined (reading 'payload') 🔴
**Location**: Next.js generated code (`giveFreely.tsx-4704fb7d.js`)
**Potential Causes**:
  - API client fetch errors not being caught
  - Response structure mismatch
  - Async state updates after unmount
**Fix**:
  - Improve API client error handling
  - Add response validation
  - Add try-catch in all async functions
**Priority**: HIGH

### 4. Missing Error Boundaries ⚠️
**Problem**: React crashes propagate to entire app
**Fix**: Add error boundary components
**Priority**: MEDIUM

### 5. Missing Favicon (Minor)
**Error**: 404 for /favicon.ico
**Fix**: Add favicon.ico to public folder
**Priority**: LOW

## Fix Order

1. ✅ Analyze errors (COMPLETE)
2. 🔄 Fix StatsCards NaN issue
3. 🔄 Fix WebSocket connection
4. 🔄 Improve API client error handling
5. 🔄 Add error boundaries
6. 🔄 Add favicon
7. 🔄 Test all fixes end-to-end

## Testing Checklist

- [ ] StatsCards displays properly with zero data
- [ ] WebSocket connects and shows "Live" status
- [ ] Trigger Scan button works without errors
- [ ] Opportunities list updates in real-time
- [ ] Error messages display gracefully
- [ ] No console errors on page load
- [ ] No console errors after triggering scan

## Next Development Options (Post-Debug)

### Option 1: Enhanced Dashboard Features
- Advanced filtering (by exchange, profit %, confidence)
- Historical charts and analytics (Recharts)
- Export functionality (CSV/JSON download)
- Detailed opportunity pages
- Portfolio tracking

### Option 2: Production Readiness
- Authentication/authorization (JWT/session)
- PostgreSQL storage upgrade
- Redis caching layer
- Comprehensive error boundaries
- API rate limiting per user
- Production deployment

### Option 3: Real-Time Enhancements
- Email/SMS alerts for high-profit opportunities
- Slack/Discord webhook notifications
- Desktop notifications
- Mobile PWA version

### Option 4: ML & Intelligence Improvements
- Better market matching models
- Predictive analytics
- Automated trading strategies
- Risk assessment dashboard

### Option 5: Testing & Quality
- E2E tests (Playwright)
- Increased unit test coverage
- API integration tests
- Performance testing

### Option 6: Developer Experience
- Swagger/OpenAPI documentation
- Developer SDK
- CLI plugins system
- Docker compose setup
