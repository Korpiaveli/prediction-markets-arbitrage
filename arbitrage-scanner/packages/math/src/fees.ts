import { IFeeCalculator } from '@arb/core';
import { SafeDecimal } from './decimal.js';

export class FeeCalculator implements IFeeCalculator {

  calculateKalshiFee(contracts: number, _price: number): number {
    // Kalshi charges per contract fee
    const baseFee = 0.01; // $0.01 per contract
    const totalFee = SafeDecimal.from(baseFee).mul(contracts);

    // Some markets may have percentage fees
    // This can be enhanced based on actual Kalshi fee schedule
    return totalFee.toNumber();
  }

  calculatePolymarketFee(profit: number): number {
    // Polymarket charges on profit only
    const feeRate = 0.02; // 2% of profit

    if (profit <= 0) return 0;

    const fee = SafeDecimal.from(profit).mul(feeRate);
    return fee.toNumber();
  }

  calculateTotalFees(
    kalshiLeg: number,
    polyLeg: number,
    contracts: number
  ): number {
    const kalshiFee = this.calculateKalshiFee(contracts, kalshiLeg);

    // Calculate potential profit for Polymarket fee
    const polyProfit = SafeDecimal.from(1).sub(polyLeg);
    const polyFee = this.calculatePolymarketFee(polyProfit.toNumber());

    return SafeDecimal.from(kalshiFee).add(polyFee).toNumber();
  }

  // Advanced fee calculation with tiers
  calculateTieredFees(volume: number, vip: boolean = false): number {
    // Can implement tiered fee structures based on volume
    if (vip) {
      return volume > 10000 ? 0.005 : 0.008;
    }
    return volume > 5000 ? 0.01 : 0.015;
  }
}