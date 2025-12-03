import {
  IArbitrageCalculator,
  QuotePair,
  ArbitrageResult,
  FeeStructure,
  ValidationResult,
  ArbitrageDirection,
  FeeBreakdown,
  CrossExchangeQuotePair,
  CrossExchangeArbitrageResult
} from '@arb/core';
import { SafeDecimal } from './decimal.js';

export class ArbitrageCalculator implements IArbitrageCalculator {

  /**
   * Calculate arbitrage for cross-exchange pairs (any two exchanges)
   */
  calculateCrossExchange(quotes: CrossExchangeQuotePair, fees: FeeStructure): CrossExchangeArbitrageResult[] {
    // Calculate Combo A: EXCHANGE1 YES + EXCHANGE2 NO
    const comboA = this.calculateCrossExchangeCombo(
      quotes.quote1.yes.ask,
      quotes.quote2.no.ask,
      fees,
      'EXCHANGE1_YES_EXCHANGE2_NO',
      quotes.exchange1,
      quotes.exchange2
    );

    // Calculate Combo B: EXCHANGE1 NO + EXCHANGE2 YES
    const comboB = this.calculateCrossExchangeCombo(
      quotes.quote1.no.ask,
      quotes.quote2.yes.ask,
      fees,
      'EXCHANGE1_NO_EXCHANGE2_YES',
      quotes.exchange1,
      quotes.exchange2
    );

    // Return both results, sorted by profit
    return [comboA, comboB].sort((a, b) => b.profitPercent - a.profitPercent);
  }

  private calculateCrossExchangeCombo(
    exchange1Price: number,
    exchange2Price: number,
    fees: FeeStructure,
    direction: ArbitrageDirection,
    exchange1Name: string,
    exchange2Name: string
  ): CrossExchangeArbitrageResult {
    const e1 = SafeDecimal.from(exchange1Price);
    const e2 = SafeDecimal.from(exchange2Price);

    // Base cost (price of both legs)
    const baseCost = e1.add(e2);

    // Calculate fees (using legacy fee structure for now)
    const feeBreakdown = this.calculateFees(exchange1Price, exchange2Price, fees);
    const totalFees = SafeDecimal.from(feeBreakdown.totalFees);

    // Total cost including fees
    const totalCost = baseCost.add(totalFees);

    // Profit calculation: guaranteed payout is 1.0
    const profit = SafeDecimal.from(1).sub(totalCost);
    const profitPercent = profit.mul(100);

    // Apply safety margin
    const safetyMargin = SafeDecimal.from(fees.safetyMarginPercent);
    const adjustedProfit = profit.sub(profit.mul(safetyMargin));

    // Validation
    const valid = adjustedProfit.gt(0);

    return {
      direction,
      profitPercent: profitPercent.toNumber(),
      totalCost: totalCost.toNumber(),
      exchange1Leg: exchange1Price,
      exchange2Leg: exchange2Price,
      fees: {
        exchange1Name: exchange1Name as any,
        exchange2Name: exchange2Name as any,
        exchange1Fee: feeBreakdown.kalshiFee,
        exchange2Fee: feeBreakdown.polymarketFee,
        totalFees: feeBreakdown.totalFees,
        feePercent: feeBreakdown.feePercent
      },
      breakEven: totalCost.toNumber(),
      valid,
      validationErrors: valid ? undefined : ['Insufficient profit after fees and safety margin']
    };
  }

  /** @deprecated Use calculateCrossExchange instead */
  calculate(quotes: QuotePair, fees: FeeStructure): ArbitrageResult[] {
    // Calculate Combo A: KALSHI YES + POLY NO
    const comboA = this.calculateCombo(
      quotes.kalshi.yes.ask,
      quotes.polymarket.no.ask,
      fees,
      'KALSHI_YES_POLY_NO'
    );

    // Calculate Combo B: KALSHI NO + POLY YES
    const comboB = this.calculateCombo(
      quotes.kalshi.no.ask,
      quotes.polymarket.yes.ask,
      fees,
      'KALSHI_NO_POLY_YES'
    );

    // Return both results, sorted by profit
    return [comboA, comboB].sort((a, b) => b.profitPercent - a.profitPercent);
  }

  private calculateCombo(
    kalshiPrice: number,
    polyPrice: number,
    fees: FeeStructure,
    direction: ArbitrageDirection
  ): ArbitrageResult {
    const k = SafeDecimal.from(kalshiPrice);
    const p = SafeDecimal.from(polyPrice);

    // Base cost (price of both legs)
    const baseCost = k.add(p);

    // Calculate fees
    const feeBreakdown = this.calculateFees(kalshiPrice, polyPrice, fees);
    const totalFees = SafeDecimal.from(feeBreakdown.totalFees);

    // Total cost including fees
    const totalCost = baseCost.add(totalFees);

    // Profit calculation: guaranteed payout is 1.0
    const profit = SafeDecimal.from(1).sub(totalCost);
    const profitPercent = profit.mul(100);

    // Apply safety margin (as percentage of profit)
    const safetyMargin = SafeDecimal.from(fees.safetyMarginPercent);
    const adjustedProfit = profit.sub(profit.mul(safetyMargin));

    // Validation
    const valid = adjustedProfit.gt(0);

    return {
      direction,
      profitPercent: profitPercent.toNumber(),
      totalCost: totalCost.toNumber(),
      kalshiLeg: kalshiPrice,
      polymarketLeg: polyPrice,
      fees: feeBreakdown,
      breakEven: totalCost.toNumber(), // Break-even is what you paid (total cost)
      valid,
      validationErrors: valid ? undefined : ['Insufficient profit after fees and safety margin']
    };
  }

  private calculateFees(
    kalshiPrice: number,
    polyPrice: number,
    fees: FeeStructure
  ): FeeBreakdown {
    const k = SafeDecimal.from(kalshiPrice);
    const p = SafeDecimal.from(polyPrice);

    // Kalshi fee (fixed per contract + optional percentage)
    let kalshiFee = SafeDecimal.from(fees.kalshiFeePerContract);
    if (fees.kalshiFeePercent) {
      kalshiFee = kalshiFee.add(k.mul(fees.kalshiFeePercent));
    }

    // Polymarket fee (percentage of profit on winning leg)
    // Worst case: assume full profit taxed
    const polyProfit = SafeDecimal.from(1).sub(p);
    const polymarketFee = polyProfit.mul(fees.polymarketFeeRate);

    // Total fees
    const totalFees = kalshiFee.add(polymarketFee);

    return {
      kalshiFee: kalshiFee.toNumber(),
      polymarketFee: polymarketFee.toNumber(),
      totalFees: totalFees.toNumber(),
      feePercent: totalFees.mul(100).toNumber()
    };
  }

  validate(result: ArbitrageResult): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for negative prices
    if (result.kalshiLeg < 0 || result.polymarketLeg < 0) {
      errors.push('Negative prices detected');
    }

    // Check for prices > 1
    if (result.kalshiLeg > 1 || result.polymarketLeg > 1) {
      errors.push('Prices exceed 1.0');
    }

    // Check total cost
    if (result.totalCost >= 1) {
      errors.push('Total cost exceeds guaranteed payout');
    }

    // Check for very low profit
    if (result.profitPercent > 0 && result.profitPercent < 0.1) {
      warnings.push('Very low profit margin');
    }

    // Check for suspiciously high profit
    if (result.profitPercent > 10) {
      warnings.push('Unusually high profit - verify data accuracy');
    }

    // Calculate confidence based on profit level and validation
    let confidence = 100;
    if (errors.length > 0) confidence = 0;
    else if (warnings.length > 0) confidence -= warnings.length * 20;
    if (result.profitPercent < 0.5) confidence -= 20;
    if (result.profitPercent > 5) confidence -= 10; // Too good to be true

    return {
      valid: errors.length === 0 && result.valid,
      errors,
      warnings,
      confidence: Math.max(0, Math.min(100, confidence))
    };
  }

  calculateMaxSize(result: ArbitrageResult, liquidity: number): number {
    // Simple calculation - can be enhanced with slippage models
    const maxAffordable = Math.floor(10000 / result.totalCost); // Assume $10k capital
    const maxLiquidity = Math.floor(liquidity);

    return Math.min(maxAffordable, maxLiquidity);
  }

  estimateSlippage(size: number, depth: number[]): number {
    // Simple linear slippage model
    // Can be enhanced with orderbook depth analysis
    if (depth.length === 0) return 0;

    const totalDepth = depth.reduce((a, b) => a + b, 0);
    if (size > totalDepth) return 0.1; // 10% slippage if exceeding depth

    // Linear approximation
    return (size / totalDepth) * 0.02; // Up to 2% slippage
  }
}