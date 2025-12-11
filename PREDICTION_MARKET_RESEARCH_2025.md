# Prediction Market & Betting Exchange Research - 2025

**Date:** December 10, 2025
**Purpose:** Identify valuable real-money prediction markets and betting exchanges for cross-platform arbitrage integration

**Current Integrations:**
- Kalshi (CFTC-regulated, real money)
- Polymarket (crypto-based, real money)
- PredictIt (partial - adapter exists)
- Manifold (play money - excluded from arbitrage)

---

## Executive Summary

### Market Landscape 2025
- **Total Industry Volume:** $27.9B+ in 2025
- **Weekly Peak Volume:** $2.3B (October 2025)
- **Combined Kalshi + Polymarket (November):** ~$10B monthly volume
- **Market Leaders:** Kalshi (60-66% market share), Polymarket (regulated US re-entry approved)

### Key Findings
1. **US Regulated Markets:** CFTC approval wave in 2025 opened major opportunities
2. **Crypto Markets:** Strong API availability, high volumes, but geographic restrictions
3. **Betting Exchanges:** European dominance, API access with fees, liquidity challenges in US
4. **Sports Markets:** Rapidly growing but legal uncertainty in many US states

---

## TIER 1: HIGHEST PRIORITY - IMMEDIATE INTEGRATION

### 1. PredictIt ⭐⭐⭐⭐⭐
**Status:** Adapter already exists, needs full activation

**Regulatory:**
- CFTC settlement reached (June 2025) - lifted most participation limits
- Full CFTC approval as DCM/DCO (September 2025)
- Expanded launch expected late 2025
- 400,000+ active users

**Trading Limits (2025):**
- Per contract: $3,500 (up from $850)
- Trader cap: Removed (was 5,000)
- Enhanced liquidity expected

**API:**
- ✅ Public API available
- URL format: `https://www.predictit.org/api/marketdata/markets/[market_id]`
- Updates: Every minute
- Restrictions: Non-commercial use, attribution required
- No closed markets in API (only "Open" markets)

**Fees:**
- 10% on earnings exceeding investment
- 5% withdrawal fee

**Markets:**
- Primary: US Politics
- Expanding: Economics, finance, culture (2025 expansion)

**Geographic:** US-focused

**Arbitrage Potential:** ⭐⭐⭐⭐⭐
- HIGH - Different user base than Kalshi/Polymarket
- Political markets overlap with both platforms
- Price inefficiencies common due to retail-heavy user base

**Volume:** Medium (400K users, expanding)

**Priority Action:** Activate existing adapter, add to production scanner

---

### 2. Robinhood Prediction Markets ⭐⭐⭐⭐⭐
**Status:** New major platform (March 2025)

**Regulatory:**
- CFTC regulated via Robinhood Derivatives LLC
- Partnership with KalshiEX for market access
- FCM registered, NFA member
- Major acquisition: 90% of MIAX Derivatives Exchange (formerly LedgerX) - November 2025

**Scale:**
- 1M+ users trading prediction markets
- 9B+ contracts traded
- $300M+ annual recurring revenue
- Drives >50% of Kalshi's trading volume

**API:**
- ❌ No public API found
- App-only access (mobile primarily)
- Integration would require partnership discussion

**Fees:**
- $0.02 per contract (very competitive)

**Markets:**
- Sports, politics, economics, culture
- Sports unavailable in: MD, NJ, NV

**Geographic:** All 50 US states (with sports restrictions)

**Arbitrage Potential:** ⭐⭐⭐⭐⭐
- EXTREME - Massive retail user base, likely price inefficiencies
- Partnership with Kalshi means same underlying markets
- 1M+ users = high liquidity

**Volume:** Very High ($300M+ ARR)

**Priority Action:** Contact for partnership/API access - highest potential ROI

---

### 3. Crypto.com Prediction Trading ⭐⭐⭐⭐
**Status:** CFTC-regulated leader in crypto space

**Regulatory:**
- CFTC-regulated derivatives via CDNA
- Available in 49 US states
- Established market leader for crypto prediction markets

**Markets:**
- Politics, economics, finance, culture
- Wide event coverage, regularly updated

**API:**
- ⚠️ Standard Crypto.com Exchange API available
- No specific prediction trading API documented
- May require app-only access or partnership

**Features:**
- USD and crypto payments
- Take profit anytime (don't need to wait for resolution)
- Institutional and retail access

**Geographic:** 49 US states

**Arbitrage Potential:** ⭐⭐⭐⭐
- HIGH - Crypto-native users vs traditional platforms
- Different pricing dynamics
- Strong institutional presence

**Volume:** High (industry leader for CFTC-regulated crypto predictions)

**Priority Action:** Research API access for prediction markets specifically

---

## TIER 2: HIGH PRIORITY - STRATEGIC VALUE

### 4. Betfair Exchange ⭐⭐⭐⭐
**Status:** World's largest betting exchange

**Regulatory:**
- Licensed: UK, Malta, Spain, Italy
- ❌ Restricted: USA, France, Australia (and others)
- NOT available for US-based arbitrage operations

**API:**
- ✅ Full API access available
- Cost: £299 one-off activation fee (non-refundable)
- Requirements: Verified Betfair account (Personal or Corporate KYC)
- Free for development (Delayed App Key)
- Read-only NOT permitted with Live API

**API Components:**
- Betting API (market navigation, odds, bet placement)
- Accounts API (balance, vendor services)
- Exchange Stream API (real-time market/price changes)

**Login Methods:**
- Non-interactive (autonomous apps)
- Interactive (user-facing apps)

**Markets:**
- Sports (primary)
- Politics
- Current affairs
- Massive liquidity on major events

**Commission:** ~5% (varies by user)

**Geographic:** UK, Europe, NOT US

**Arbitrage Potential:** ⭐⭐⭐⭐
- HIGH for non-US operations
- ❌ BLOCKED for US-based arbitrage
- Would need non-US entity/users

**Volume:** Extremely High (world's largest exchange)

**Priority Action:** Future consideration for international expansion only

---

### 5. Smarkets ⭐⭐⭐⭐
**Status:** Modern, tech-focused betting exchange

**Regulatory:**
- Licensed: UK, Malta
- ❌ Restricted: USA, France, Australia

**API:**
- ✅ Free API access
- Real-time data, custom trading bots supported
- Market depth and price movement data
- API integration for automated strategies

**Commission:**
- Standard: 2% flat rate (vs Betfair's 5%)
- Pro Tier: 1% for high-volume traders

**Markets:**
- Football, horse racing, tennis
- Politics, current affairs
- Strong political markets liquidity

**Geographic:** UK/Europe primarily, NOT US

**Arbitrage Potential:** ⭐⭐⭐
- MEDIUM-HIGH for non-US operations
- Lower fees than Betfair (2% vs 5%)
- Good for political market arbitrage
- ❌ BLOCKED for US operations

**Volume:** High (competitive with Betfair on major events)

**Priority Action:** International expansion consideration

---

### 6. Matchbook ⭐⭐⭐
**Status:** Betting exchange with developer focus

**API:**
- ✅ RESTful API available immediately for all registered customers
- Official developer portal: https://developers.matchbook.com/
- Formats: JSON (recommended), XML
- Session token authentication

**Pricing:**
- FREE: Standard tier (rate limited)
- Trader Plan: Recommended for significant API usage
- API Plan: 100 GBP per 1M GET requests/month
- WRITE requests: Free (if reasonable frequency)

**Commission:** 2%

**Features:**
- Multiple currencies, odds types, exchange types
- Price Link tool
- Matchbook Zero (0% commission on select markets)

**Markets:** Sports primarily

**Geographic:** International, limited US access

**Arbitrage Potential:** ⭐⭐⭐
- MEDIUM - Good API, reasonable pricing
- Developer-friendly
- ❌ Limited US access

**Volume:** Medium

**Priority Action:** Evaluate for non-US expansion

---

## TIER 3: CRYPTO PREDICTION MARKETS - MEDIUM PRIORITY

### 7. Polymarket (Already Integrated) ⭐⭐⭐⭐⭐
**Current Status:** Integrated, but note recent developments

**2025 Updates:**
- CFTC approval granted (November 2025) for US re-entry via regulated brokers
- $2B investment from ICE (NYSE parent), $9B valuation
- Monthly volume: $3.74B (November 2025)

**API:**
- ✅ Comprehensive API available
- Order Book API (market makers, traders)
- Data API: `https://data-api.polymarket.com/`
- GitHub: TypeScript clients, SDKs, AI agent framework
- FREE basic access (1,000 calls/hour)
- Premium: $99+/month (WebSocket, historical data)

**Geographic Restrictions:**
- ❌ US persons prohibited from trading (via UI & API)
- Data viewable globally
- NEW: Will have US access via regulated brokers (2025-2026)

**Arbitrage Potential:** ⭐⭐⭐⭐⭐ (Already utilized)

---

### 8. Azuro Protocol ⭐⭐⭐⭐
**Status:** Decentralized sports betting infrastructure

**Description:**
- "Shopify of sports betting" - white-label infrastructure
- LiquidityTree vAMM with single LP design
- Handles odds-making, liquidity, oracles, settlement

**Technical:**
- SDK, toolkit packages on GitHub (92 followers)
- React components for frontend integration
- EVM-compatible blockchains

**Stats (August/September 2025):**
- 30+ live dApps powered by Azuro
- $530M+ cumulative volume
- ~31K unique wallets
- Operates on: Polygon, Base, Chiliz, Gnosis

**API:**
- ✅ Developer SDK available
- GitHub: github.com/Azuro-protocol
- Docs: gem.azuro.org
- TypeScript examples

**Upcoming (Q4 2025):**
- Cross-chain order book (Solana, Base, Arbitrum)
- Aggregated liquidity across chains

**Markets:** Primarily sports

**Arbitrage Potential:** ⭐⭐⭐⭐
- HIGH - On-chain transparency, multiple dApps
- Cross-dApp arbitrage opportunities
- NEW cross-chain opportunities coming Q4 2025

**Priority Action:** Investigate after cross-chain launch

---

### 9. Gnosis/Omen/Presagio ⭐⭐⭐
**Status:** AI-enhanced prediction markets

**Background:**
- Omen: Original Gnosis prediction market (developed 2018-2022)
- Presagio: "Omen 2.0" reboot (2024-2025) with AI agents
- Built on Conditional Token Framework (CTF)

**API & Tools:**
- ✅ prediction-market-agent-tooling (GitHub)
- Python >=3.10, Poetry package manager
- OmenAgentMarket class for programmatic betting
- AI agent framework for automated trading

**Features:**
- Decentralized, multi-chain
- AMM: CPMM/LMSR models
- Resolution: Crowdsourced via Kleros
- 361+ daily active AI agents (8.2M+ transactions on Gnosis Chain)

**Markets:** Politics, economics, culture, sports

**Arbitrage Potential:** ⭐⭐⭐
- MEDIUM - Smaller liquidity than major platforms
- AI-agent arbitrage opportunities
- Good for research/development

**Volume:** Lower than tier 1 platforms

**Priority Action:** Research/development use case

---

### 10. Augur v2 ⭐⭐
**Status:** Original decentralized prediction market, rebooting

**Background:**
- Launched 2020 (v2), built on Ethereum
- Uses DAI for trading, 24h resolution (vs v1's 7 days)
- "Invalid" is tradeable outcome

**Current Status (2025):**
- Rebooting with next-gen oracle technology
- Repository updates: October-December 2025
- augur-reboot-website active

**API:**
- ✅ Augur SDK (TypeScript, Node.js, browser)
- Smart contracts in Solidity
- Developer docs available

**Arbitrage Potential:** ⭐⭐
- LOW-MEDIUM - Platform in transition
- Uncertain liquidity during reboot
- Historical significance, may regain prominence

**Volume:** Unknown (rebooting)

**Priority Action:** Monitor reboot progress, revisit 2026

---

## TIER 4: SPORTS BETTING EXCHANGES - US MARKET

### 11. Prophet Exchange / ProphetX ⭐⭐
**Status:** Paused and relaunched with different model

**History:**
- Launched with Caesars partnership (NJ, IN)
- Paused operations <2 years after launch
- Relaunched as ProphetX (sweepstakes model)

**Current Model:**
- Sweepstakes-based (legally uncertain)
- Available in more states than original

**API:**
- Public API planned/promised for third-party developers
- Current status unclear

**Arbitrage Potential:** ⭐⭐
- LOW - Uncertain legal model
- Liquidity concerns after pause/relaunch

**Priority Action:** Monitor legal developments

---

### 12. Sporttrade ⭐⭐⭐
**Status:** Stock market-style sports betting

**Model:**
- Contracts expire at $0 or $100
- Buy/sell anytime (like stock trading)
- Market makers solve liquidity

**Regulatory:**
- New Jersey primarily
- Legal betting exchange model

**API:**
- Status unknown from research

**Arbitrage Potential:** ⭐⭐⭐
- MEDIUM - Limited geographic availability
- Interesting model for price discovery
- Need more liquidity data

**Priority Action:** Research API availability

---

### 13. Betdaq ⭐⭐⭐
**Status:** Established European betting exchange

**API:**
- ✅ Full API available
- Cost: £250 one-off fee (non-refundable)
- Requirements: Fully verified, funded, active account
- Must request and receive authorization

**API Structure:**
- Read-only methods (username only)
- Secure methods (username + password)
- AAPI & GBEi protocols available (Python)

**Commission:** 2%

**Developer Contact:** [email protected]

**Arbitrage Potential:** ⭐⭐⭐
- MEDIUM - European focus
- ❌ Limited/no US access
- Good API documentation

**Priority Action:** International expansion only

---

## EXCLUDED PLATFORMS

### Play Money / No Real Money
- ❌ Manifold Markets (play money only) - adapter exists but excluded from arbitrage
- ❌ PredictionBook (no real money)
- ❌ Metaculus (no trading, forecasting only)

### Legal/Access Issues
- ❌ FanDuel Predicts (launched Dec 2025, partnership with CME - too new, research needed)
- ❌ Opinion (mentioned in research, limited data available)

---

## PRIORITY INTEGRATION ROADMAP

### Phase 1: Immediate (Q1 2026)
1. **Activate PredictIt** - Adapter exists, high arbitrage potential
2. **Robinhood Partnership** - Contact for API access, highest volume opportunity
3. **Crypto.com API Research** - Determine prediction market API availability

### Phase 2: High Value (Q2 2026)
4. **Azuro Protocol** - After Q4 2025 cross-chain launch
5. **Betfair** - IF expanding to non-US operations
6. **Smarkets** - IF expanding to non-US operations

### Phase 3: Strategic (H2 2026)
7. **Gnosis/Presagio** - AI agent arbitrage research
8. **Matchbook** - International expansion
9. **FanDuel Predicts** - Monitor development, evaluate 2026

### Phase 4: Research (2026+)
10. **Augur v2** - Monitor reboot success
11. **Sporttrade** - If expands geographically
12. **Prophet/ProphetX** - If legal model clarifies

---

## KEY CONSIDERATIONS

### Geographic Restrictions
**US-Accessible (Real Money):**
- Kalshi ✅ (integrated)
- PredictIt ✅ (adapter exists)
- Robinhood ✅ (49-50 states)
- Crypto.com ✅ (49 states)
- Polymarket ⚠️ (US re-entry 2025-2026 via brokers)

**Non-US Only:**
- Betfair (UK/Europe)
- Smarkets (UK/Europe)
- Betdaq (UK/Europe)
- Matchbook (International)

**Blockchain/Crypto (Geographic varies):**
- Azuro (global, chain-dependent)
- Gnosis/Presagio (global)
- Augur (global, regulatory uncertainty)

### API Access Summary
| Platform | API | Cost | Documentation |
|----------|-----|------|---------------|
| PredictIt | ✅ Public | Free | Good |
| Robinhood | ❌ None | N/A | App-only |
| Crypto.com | ⚠️ Exchange | Free | Need prediction-specific |
| Betfair | ✅ Full | £299 | Excellent |
| Smarkets | ✅ Free | Free | Good |
| Matchbook | ✅ Full | 100 GBP/1M calls | Good |
| Betdaq | ✅ Full | £250 | Good |
| Polymarket | ✅ Full | Free/$99+ | Excellent |
| Azuro | ✅ SDK | Free | Good |
| Gnosis/Presagio | ✅ SDK | Free | Good |
| Augur | ✅ SDK | Free | Good (dated) |

### Volume & Liquidity Rankings (2025)
1. **Kalshi** - $5.8B/month (November 2025)
2. **Polymarket** - $3.74B/month (November 2025)
3. **Betfair** - Extremely high (international)
4. **Robinhood** - Very high ($300M+ ARR, 9B contracts)
5. **Azuro** - $530M cumulative
6. **Smarkets** - High (competitive on major events)
7. **PredictIt** - Medium-high (400K users)
8. **Crypto.com** - High (market leader in segment)
9. Others - Medium to low

### Fee Comparison
| Platform | Trading Fee | Withdrawal | Notes |
|----------|-------------|------------|-------|
| Robinhood | $0.02/contract | Standard | Lowest |
| Smarkets | 2% | Standard | Pro tier: 1% |
| Matchbook | 2% | Standard | 0% on select markets |
| Betdaq | 2% | Standard | |
| Betfair | ~5% | Standard | Varies by user |
| PredictIt | 10% on profits | 5% | Highest fees |
| Crypto.com | Varies | Standard | Crypto + USD |
| Kalshi | Varies | Standard | CFTC regulated |
| Polymarket | 2% | Gas fees | Crypto-based |

---

## ARBITRAGE OPPORTUNITY ANALYSIS

### Highest Arbitrage Potential
1. **Robinhood ↔ Kalshi** (partnership = same markets, 1M retail users vs institutional)
2. **PredictIt ↔ Kalshi/Polymarket** (politics overlap, different user bases)
3. **Crypto.com ↔ Traditional platforms** (crypto users vs traditional)
4. **Azuro dApps ↔ Centralized platforms** (on-chain vs off-chain)

### Market Overlap Opportunities
- **Politics:** PredictIt, Kalshi, Polymarket, Robinhood, Betfair, Smarkets
- **Sports:** Robinhood, Kalshi, Azuro, Betfair, Smarkets, Matchbook, Betdaq
- **Economics/Finance:** Kalshi, Polymarket, Crypto.com, Betfair
- **Culture/Entertainment:** Robinhood, Polymarket, Crypto.com

### Cross-Platform Inefficiency Drivers
1. **User Demographics** - Retail (Robinhood, PredictIt) vs Institutional (Kalshi)
2. **Payment Methods** - Crypto vs Fiat
3. **Geographic** - US vs International regulations
4. **Fee Structures** - Different incentives alter pricing
5. **Liquidity Depth** - Smaller platforms lag price discovery

---

## RECOMMENDATIONS

### Immediate Actions (Week 1-2)
1. **Activate PredictIt adapter** - Low hanging fruit, existing code
2. **Contact Robinhood** - Explore partnership for API access
3. **Research Crypto.com** - Determine prediction API specifics

### Short-term (Month 1-3)
4. **Implement Azuro** - After cross-chain launch
5. **Evaluate US expansion** - Focus on CFTC-regulated platforms
6. **Monitor FanDuel Predicts** - New major entrant (Dec 2025)

### Long-term (2026+)
7. **International expansion decision** - Betfair, Smarkets, Betdaq APIs ready
8. **Research platforms** - Gnosis, Augur for innovation
9. **Monitor regulatory changes** - Sports betting federal landscape evolving

### Partnership Priorities
1. Robinhood (highest ROI potential)
2. Crypto.com (market leader in crypto segment)
3. Betfair (if going international)

### Technical Priorities
1. PredictIt (activate existing adapter)
2. Azuro SDK integration
3. Gnosis/Presagio for AI agent research

---

## SOURCES

### Primary Research
- [PredictIt API Documentation](https://predictit.freshdesk.com/support/solutions/articles/12000001878-does-predictit-make-market-data-available-via-an-api-)
- [PredictIt Review 2025](https://ats.io/prediction-markets/predictit/)
- [Betfair Developer Portal](https://developer.betfair.com/)
- [Betfair API Guide](https://developer.betfair.com/exchange-api/)
- [Smarkets Trading API](https://docs.smarkets.com/)
- [Smarkets Review 2025](https://punter2pro.com/smarkets-review-free-bet/)
- [CFTC Prediction Markets Announcement](https://www.cftc.gov/PressRoom/PressReleases/9046-25)
- [Polymarket CFTC Approval](https://www.yogonet.com/international/news/2025/11/27/116520-polymarket-gains-cftc-approval-to-operate-regulated-us-prediction-market)
- [CFTC Regulatory Landscape 2025](https://nexteventhorizon.substack.com/p/where-things-stand-for-prediction-markets-legally)
- [Augur GitHub Repository](https://github.com/AugurProject/augur)
- [Augur Reboot Announcement](https://augur.net/)
- [Gnosis Prediction Market Tooling](https://github.com/gnosis/prediction-market-agent-tooling)
- [Presagio Platform](https://presagio.pages.dev/)
- [Azuro Protocol Overview](https://azuro.org/)
- [Azuro GitHub](https://github.com/Azuro-protocol)
- [Matchbook Developer Portal](https://developers.matchbook.com/)
- [Betdaq API Documentation](https://api.betdaq.com/)
- [Robinhood Prediction Markets Launch](https://robinhood.com/us/en/newsroom/robinhood-prediction-markets-hub/)
- [Robinhood Acquisition](https://www.coindesk.com/markets/2025/11/26/robinhood-makes-prediction-market-push-with-purchase-of-former-ftx-platform-ledgerx)
- [Crypto.com Prediction Trading](https://crypto.com/en/research/prediction-markets-oct-2025)
- [Polymarket API Documentation](https://docs.polymarket.com/polymarket-learn/FAQ/does-polymarket-have-an-api)
- [Polymarket GitHub](https://github.com/polymarket)
- [Kalshi vs Polymarket Volume Analysis](https://www.coindesk.com/markets/2025/09/20/kalshi-outpaces-polymarket-in-prediction-market-volume-amid-surge-in-u-s-trading)
- [Prediction Markets 2025 Analysis](https://medium.com/@monolith.vc/prediction-markets-2025-polymarket-kalshi-and-the-next-big-rotation-c00f1ba35d13)
- [Top Crypto Prediction Markets 2025](https://www.tokenmetrics.com/blog/top-crypto-prediction-markets-guide-2025)
- [US Sports Betting Exchanges](https://www.bettingusa.com/sports/exchanges/)
- [CFTC Sports Betting Impact](https://www.foley.com/insights/publications/2025/06/the-cftc-is-shaking-up-sports-bettings-legal-future/)

### Market Data Sources
- [DeFiRate Prediction Markets](https://defirate.com/prediction-markets/)
- [CryptoRank Prediction Markets Analysis](https://cryptorank.io/insights/analytics/prediction-markets-polymarket-vs-kalshi)
- [KPMG Prediction Markets State](https://kpmg.com/us/en/articles/2025/current-state-of-prediction-markets.html)
- [a16z State of Crypto 2025](https://a16zcrypto.com/posts/article/state-of-crypto-report-2025/)

---

**Document Version:** 1.0
**Last Updated:** December 10, 2025
**Next Review:** Q1 2026 (post-regulatory updates)
