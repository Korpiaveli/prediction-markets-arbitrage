import { Quote, ArbitrageOpportunity } from '@arb/core';

export class ValidationService {

  validateQuote(quote: Quote): string[] {
    const errors: string[] = [];

    // Check bid/ask spread
    if (quote.yes.bid > quote.yes.ask) {
      errors.push('YES bid > ask (inverted spread)');
    }

    if (quote.no.bid > quote.no.ask) {
      errors.push('NO bid > ask (inverted spread)');
    }

    // Check price bounds
    if (quote.yes.ask > 1 || quote.yes.bid < 0) {
      errors.push('YES prices out of bounds [0,1]');
    }

    if (quote.no.ask > 1 || quote.no.bid < 0) {
      errors.push('NO prices out of bounds [0,1]');
    }

    // Check YES + NO relationship (should sum close to 1)
    const sumMid = quote.yes.mid + quote.no.mid;
    if (Math.abs(sumMid - 1) > 0.1) {
      errors.push(`YES + NO mid prices sum to ${sumMid}, expected ~1.0`);
    }

    // Check for stale data
    const staleness = Date.now() - quote.lastUpdate.getTime();
    if (staleness > 60000) { // 1 minute
      errors.push('Quote data is stale (>1 minute old)');
    }

    return errors;
  }

  validateOpportunity(opp: ArbitrageOpportunity): boolean {
    // Basic sanity checks
    if (opp.profitPercent < 0) return false;
    if (opp.profitPercent > 50) return false; // Too good to be true
    if (opp.totalCost >= 1) return false;
    if (opp.totalCost <= 0) return false;
    if (opp.maxSize <= 0) return false;

    // Check that prices make sense
    const kalshiErrors = this.validateQuote(opp.quotePair.kalshi);
    const polyErrors = this.validateQuote(opp.quotePair.polymarket);

    return kalshiErrors.length === 0 && polyErrors.length === 0;
  }

  checkArbitrageFeasibility(
    entry1: number,
    entry2: number,
    fees: number,
    safetyMargin: number
  ): boolean {
    const totalCost = entry1 + entry2 + fees;
    const profit = 1 - totalCost;
    return profit > safetyMargin;
  }
}