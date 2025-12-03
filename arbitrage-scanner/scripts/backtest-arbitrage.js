#!/usr/bin/env node

/**
 * Historical Arbitrage Backtest Simulator
 * Simulates $1,000 investment across historical market pairs
 */

const fs = require('fs');
const path = require('path');

// Fee structures
const FEES = {
  kalshi: {
    perContract: 0.01,    // $0.01 per contract
    percentage: 0.007     // 0.7% on winning side
  },
  polymarket: {
    percentage: 0.02      // 2% on winning side
  }
};

class ArbitrageBacktest {
  constructor(historicalData, initialCapital = 1000) {
    this.data = historicalData;
    this.capital = initialCapital;
    this.trades = [];
    this.totalProfit = 0;
  }

  /**
   * Calculate arbitrage for a single market pair
   */
  calculateArbitrage(pair) {
    const kPrice = pair.kalshi.final_price_yes;
    const pPrice = pair.polymarket.final_price_yes;

    // Arbitrage strategy: Buy lower price, sell higher price (or buy YES on both)
    // But we need complementary positions for guaranteed profit

    // Strategy: Buy YES on cheaper exchange, NO on expensive exchange
    const buyYes = kPrice < pPrice ? 'kalshi' : 'polymarket';
    const buyNo = kPrice < pPrice ? 'polymarket' : 'kalshi';

    const yesPrice = Math.min(kPrice, pPrice);
    const noPrice = buyYes === 'kalshi' ? (1 - pPrice) : (1 - kPrice);

    // Total cost to lock in $1 payout
    const totalCost = yesPrice + noPrice;

    // Guaranteed payout is always $1.00
    const guaranteedPayout = 1.0;

    // Calculate fees
    let kalshiFee = 0;
    let polymarketFee = 0;

    if (buyYes === 'kalshi') {
      // Bought YES on Kalshi
      kalshiFee = FEES.kalshi.perContract + (guaranteedPayout * FEES.kalshi.percentage);
      // Bought NO on Polymarket (lost)
      polymarketFee = 0; // No fee on losing side
    } else {
      // Bought YES on Polymarket
      polymarketFee = guaranteedPayout * FEES.polymarket.percentage;
      // Bought NO on Kalshi (lost)
      kalshiFee = FEES.kalshi.perContract; // Still pay per-contract fee
    }

    const totalFees = kalshiFee + polymarketFee;

    // Net profit per $1 invested
    const netProfit = guaranteedPayout - totalCost - totalFees;
    const roi = (netProfit / totalCost) * 100;

    return {
      pair_id: pair.pair_id,
      title: pair.kalshi.title,
      buyYes,
      buyNo,
      yesPrice,
      noPrice,
      totalCost,
      guaranteedPayout,
      fees: {
        kalshi: kalshiFee,
        polymarket: polymarketFee,
        total: totalFees
      },
      netProfit,
      roi,
      profitable: netProfit > 0
    };
  }

  /**
   * Allocate capital across all profitable opportunities
   */
  allocateCapital(opportunities) {
    // Filter profitable opportunities
    const profitable = opportunities.filter(o => o.profitable);

    if (profitable.length === 0) {
      console.log('⚠️  No profitable opportunities found!');
      return [];
    }

    // Equal allocation strategy
    const capitalPerTrade = this.capital / profitable.length;

    return profitable.map(opp => {
      const numContracts = Math.floor(capitalPerTrade / opp.totalCost);
      const actualInvestment = numContracts * opp.totalCost;
      const actualProfit = numContracts * opp.netProfit;

      return {
        ...opp,
        numContracts,
        actualInvestment,
        actualProfit,
        actualRoi: (actualProfit / actualInvestment) * 100
      };
    });
  }

  /**
   * Run backtest simulation
   */
  run() {
    console.log('\n' + '='.repeat(80));
    console.log('HISTORICAL ARBITRAGE BACKTEST SIMULATION');
    console.log('='.repeat(80));
    console.log(`Dataset: ${this.data.metadata.dataset}`);
    console.log(`Initial Capital: $${this.capital.toFixed(2)}`);
    console.log(`Markets: ${this.data.overlapping_markets.length} pairs`);
    console.log('='.repeat(80) + '\n');

    // Calculate arbitrage for each pair
    const opportunities = this.data.overlapping_markets.map(pair =>
      this.calculateArbitrage(pair)
    );

    // Display opportunities
    console.log('ARBITRAGE OPPORTUNITIES:\n');
    opportunities.forEach((opp, i) => {
      const status = opp.profitable ? '✅' : '❌';
      console.log(`${i + 1}. ${status} ${opp.title}`);
      console.log(`   Strategy: Buy YES on ${opp.buyYes.toUpperCase()} ($${opp.yesPrice.toFixed(2)}), NO on ${opp.buyNo.toUpperCase()} ($${opp.noPrice.toFixed(2)})`);
      console.log(`   Total Cost: $${opp.totalCost.toFixed(4)} | Fees: $${opp.fees.total.toFixed(4)} | Net Profit: $${opp.netProfit.toFixed(4)}`);
      console.log(`   ROI: ${opp.roi.toFixed(2)}%\n`);
    });

    // Allocate capital
    const trades = this.allocateCapital(opportunities);

    if (trades.length === 0) {
      console.log('❌ No trades executed (no profitable opportunities)\n');
      return;
    }

    // Calculate totals
    const totalInvested = trades.reduce((sum, t) => sum + t.actualInvestment, 0);
    const totalProfit = trades.reduce((sum, t) => sum + t.actualProfit, 0);
    const avgRoi = (totalProfit / totalInvested) * 100;
    const finalCapital = this.capital + totalProfit;

    console.log('\n' + '='.repeat(80));
    console.log('EXECUTION SUMMARY');
    console.log('='.repeat(80) + '\n');

    trades.forEach((trade, i) => {
      console.log(`Trade ${i + 1}: ${trade.title}`);
      console.log(`  Contracts: ${trade.numContracts}`);
      console.log(`  Investment: $${trade.actualInvestment.toFixed(2)}`);
      console.log(`  Profit: $${trade.actualProfit.toFixed(2)} (${trade.actualRoi.toFixed(2)}%)\n`);
    });

    console.log('='.repeat(80));
    console.log('FINAL RESULTS');
    console.log('='.repeat(80));
    console.log(`Initial Capital:    $${this.capital.toFixed(2)}`);
    console.log(`Total Invested:     $${totalInvested.toFixed(2)}`);
    console.log(`Total Profit:       $${totalProfit.toFixed(2)}`);
    console.log(`Final Capital:      $${finalCapital.toFixed(2)}`);
    console.log(`Average ROI:        ${avgRoi.toFixed(2)}%`);
    console.log(`Number of Trades:   ${trades.length}`);
    console.log('='.repeat(80) + '\n');

    return {
      initialCapital: this.capital,
      totalInvested,
      totalProfit,
      finalCapital,
      avgRoi,
      trades
    };
  }
}

// Load historical data
const dataPath = path.join(__dirname, '../data/historical_2024_election_markets.json');
const historicalData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// Run backtest with $1,000
const backtest = new ArbitrageBacktest(historicalData, 1000);
const results = backtest.run();

// Save results
const resultsPath = path.join(__dirname, '../data/backtest_results.json');
fs.writeFileSync(resultsPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  ...results
}, null, 2));

console.log(`📊 Results saved to: ${resultsPath}\n`);
