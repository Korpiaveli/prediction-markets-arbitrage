import { Router, Request, Response } from 'express';
import { ApiContext } from '../types';

export function createStatsRoutes(context: ApiContext): Router {
  const router = Router();

  router.get('/risk', async (_req: Request, res: Response) => {
    try {
      const opportunities = await context.storage.getOpportunities({ limit: 100 });

      if (opportunities.length === 0) {
        return res.json({
          success: true,
          data: null
        });
      }

      const profits = opportunities.map(o => o.profitPercent);
      const avgProfit = profits.reduce((a, b) => a + b, 0) / profits.length;

      const winningTrades = profits.filter(p => p > 0).length;

      const avgWin = profits.filter(p => p > 0).length > 0
        ? profits.filter(p => p > 0).reduce((a, b) => a + b, 0) / profits.filter(p => p > 0).length
        : 0;
      const avgLoss = profits.filter(p => p <= 0).length > 0
        ? Math.abs(profits.filter(p => p <= 0).reduce((a, b) => a + b, 0) / profits.filter(p => p <= 0).length)
        : 0;

      const variance = profits.reduce((sum, p) => sum + Math.pow(p - avgProfit, 2), 0) / profits.length;
      const stdDev = Math.sqrt(variance);
      const sharpeRatio = stdDev > 0 ? avgProfit / stdDev : 0;

      let maxDrawdown = 0;
      let peak = 0;
      let cumulative = 0;
      for (const profit of profits) {
        cumulative += profit;
        if (cumulative > peak) peak = cumulative;
        const drawdown = peak - cumulative;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      let consecutiveLosses = 0;
      let maxConsecutiveLosses = 0;
      for (const profit of profits) {
        if (profit <= 0) {
          consecutiveLosses++;
          maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
        } else {
          consecutiveLosses = 0;
        }
      }

      const totalWins = profits.filter(p => p > 0).reduce((a, b) => a + b, 0);
      const totalLosses = Math.abs(profits.filter(p => p <= 0).reduce((a, b) => a + b, 0));
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

      const metrics = {
        sharpeRatio: Number.isFinite(sharpeRatio) ? sharpeRatio : 0,
        maxDrawdown,
        winRate: (winningTrades / profits.length) * 100,
        profitFactor: Number.isFinite(profitFactor) ? Math.min(profitFactor, 10) : 0,
        averageProfit: avgWin,
        averageLoss: avgLoss,
        totalTrades: profits.length,
        consecutiveLosses: maxConsecutiveLosses,
        volatility: stdDev
      };

      return res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.get('/forecast', async (_req: Request, res: Response) => {
    try {
      const opportunities = await context.storage.getOpportunities({ limit: 500 });

      if (opportunities.length < 10) {
        return res.json({
          success: true,
          data: null
        });
      }

      const hourCounts: Record<number, number> = {};
      const dayHourCounts: Record<string, number> = {};

      for (const opp of opportunities) {
        const date = new Date(opp.timestamp);
        const hour = date.getHours();
        const dayOfWeek = date.getDay();
        const key = `${dayOfWeek}-${hour}`;

        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        dayHourCounts[key] = (dayHourCounts[key] || 0) + 1;
      }

      const bestTimes = Object.entries(dayHourCounts)
        .map(([key, count]) => {
          const [day, hour] = key.split('-').map(Number);
          return {
            dayOfWeek: day,
            hour,
            probability: Math.min(100, (count / opportunities.length) * 100 * 10)
          };
        })
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 10);

      const profits = opportunities.map(o => o.profitPercent);
      const avgProfit = profits.reduce((a, b) => a + b, 0) / profits.length;
      const maxProfit = Math.max(...profits);
      const minProfit = Math.min(...profits);

      const now = new Date();
      const recentOpps = opportunities.filter(o => {
        const oppTime = new Date(o.timestamp);
        return (now.getTime() - oppTime.getTime()) < 24 * 60 * 60 * 1000;
      });
      const expectedDaily = Math.max(1, recentOpps.length);

      const hoursSinceLastOpp = opportunities.length > 0
        ? (now.getTime() - new Date(opportunities[0].timestamp).getTime()) / (1000 * 60 * 60)
        : 24;

      const avgGapHours = 24 / Math.max(1, expectedDaily);
      const nextOppETA = Math.max(0, avgGapHours - hoursSinceLastOpp) * 60;

      const forecast = {
        forecast: {
          category: 'all',
          expectedCount: expectedDaily,
          expectedProfitRange: {
            min: minProfit,
            max: maxProfit,
            avg: avgProfit
          },
          bestScanTimes: bestTimes
        },
        timing: {
          nextOpportunityETA: nextOppETA,
          confidence: Math.min(90, 50 + opportunities.length / 10),
          reasoning: [
            `Based on ${opportunities.length} historical opportunities`,
            `Average profit: ${avgProfit.toFixed(2)}%`,
            `Most active periods identified`
          ],
          marketConditions: {
            volatility: avgProfit > 3 ? 'high' : avgProfit > 1.5 ? 'medium' : 'low',
            volume: expectedDaily > 5 ? 'high' : expectedDaily > 2 ? 'medium' : 'low',
            newsActivity: 'medium'
          }
        }
      };

      return res.json({
        success: true,
        data: forecast
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}
