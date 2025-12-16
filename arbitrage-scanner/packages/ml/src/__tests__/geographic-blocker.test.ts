import { describe, test, expect, beforeEach } from 'vitest';
import { HardBlockerValidator } from '../validators/HardBlockerValidator';
import { Market } from '@arb/core';

describe('GeographicBlocker with US Defaults', () => {
  let validator: HardBlockerValidator;

  beforeEach(() => {
    validator = new HardBlockerValidator();
    validator.clearBlockedLog();
  });

  const createMarket = (overrides: Partial<Market>): Market => ({
    id: 'test-id',
    exchangeId: 'test-id',
    exchange: 'KALSHI',
    title: 'Test Market',
    description: '',
    active: true,
    ...overrides
  });

  describe('Default US assumption for Kalshi/PredictIt', () => {
    test('Kalshi implicit US vs Honduras should be BLOCKED', () => {
      const kalshiMarket = createMarket({
        exchange: 'KALSHI',
        title: 'Will Trump win 2028?'
      });

      const hondurasMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Honduras President 2028: Nasralla'
      });

      const result = validator.validate(kalshiMarket, hondurasMarket);
      expect(result.blocked).toBe(true);
      expect(result.severity).toBe('CRITICAL');
      expect(result.reason).toContain('Geographic mismatch');
      expect(result.reason).toContain('united states');
      expect(result.reason).toContain('honduras');
    });

    test('PredictIt implicit US vs Mexico should be BLOCKED', () => {
      const predictItMarket = createMarket({
        exchange: 'PREDICTIT',
        title: 'Who wins Senate race?'
      });

      const mexicoMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Mexico President 2028'
      });

      const result = validator.validate(predictItMarket, mexicoMarket);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('mexico');
    });

    test('Kalshi Trump vs Polymarket Trump should NOT be blocked', () => {
      const kalshiMarket = createMarket({
        exchange: 'KALSHI',
        title: 'Will Trump win 2028?'
      });

      const polyMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Trump wins 2028 election'
      });

      const result = validator.validate(kalshiMarket, polyMarket);
      expect(result.blocked).toBe(false);
    });

    test('Two Kalshi markets (both US default) should NOT be blocked by geography', () => {
      const m1 = createMarket({
        exchange: 'KALSHI',
        title: 'Will inflation rise in 2028?'
      });

      const m2 = createMarket({
        exchange: 'KALSHI',
        title: 'Economy growth forecast 2028'
      });

      const result = validator.validate(m1, m2);
      expect(result.blocked).toBe(false);
    });
  });

  describe('US politician detection', () => {
    test('Market mentioning Biden should be detected as US', () => {
      const bidenMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Will Biden run in 2028?'
      });

      const hondurasMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Honduras President 2028'
      });

      const result = validator.validate(bidenMarket, hondurasMarket);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Geographic mismatch');
    });

    test('Market mentioning Harris should be detected as US', () => {
      const harrisMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Will Harris be nominee?'
      });

      const mexicoMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Who wins Mexico election?'
      });

      const result = validator.validate(harrisMarket, mexicoMarket);
      expect(result.blocked).toBe(true);
    });

    test('Market mentioning DeSantis should be detected as US', () => {
      const desantisMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'DeSantis presidential odds'
      });

      const canadaMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Canada PM election'
      });

      const result = validator.validate(desantisMarket, canadaMarket);
      expect(result.blocked).toBe(true);
    });

    test('Two markets with US politicians should NOT be blocked', () => {
      const trumpMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Trump vs Biden 2028'
      });

      const harrisMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Harris nomination odds'
      });

      const result = validator.validate(trumpMarket, harrisMarket);
      expect(result.blocked).toBe(false);
    });
  });

  describe('Explicit country detection', () => {
    test('Explicit US vs Honduras should be BLOCKED', () => {
      const usMarket = createMarket({
        title: 'US Presidential Election 2028'
      });

      const hondurasMarket = createMarket({
        title: 'Honduras Presidential Election 2028'
      });

      const result = validator.validate(usMarket, hondurasMarket);
      expect(result.blocked).toBe(true);
    });

    test('UK vs France should be BLOCKED', () => {
      const ukMarket = createMarket({
        title: 'United Kingdom general election'
      });

      const franceMarket = createMarket({
        title: 'France presidential election'
      });

      const result = validator.validate(ukMarket, franceMarket);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('united kingdom');
      expect(result.reason).toContain('france');
    });

    test('Same country (Brazil vs Brazil) should NOT be blocked', () => {
      const m1 = createMarket({
        title: 'Brazil election outcome'
      });

      const m2 = createMarket({
        title: 'Who wins in Brazil?'
      });

      const result = validator.validate(m1, m2);
      expect(result.blocked).toBe(false);
    });
  });

  describe('US indicators (institutions)', () => {
    test('Market with Congress should be treated as US', () => {
      const congressMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Will Congress pass the bill?'
      });

      const mexicoMarket = createMarket({
        title: 'Mexico election results'
      });

      const result = validator.validate(congressMarket, mexicoMarket);
      expect(result.blocked).toBe(true);
    });

    test('Market with White House should be treated as US', () => {
      const whiteHouseMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Who occupies White House in 2029?'
      });

      const canadaMarket = createMarket({
        title: 'Canada PM after next election'
      });

      const result = validator.validate(whiteHouseMarket, canadaMarket);
      expect(result.blocked).toBe(true);
    });

    test('Market with electoral college should be treated as US', () => {
      const ecMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Electoral college vote count'
      });

      const germanyMarket = createMarket({
        title: 'Germany chancellor election'
      });

      const result = validator.validate(ecMarket, germanyMarket);
      expect(result.blocked).toBe(true);
    });
  });

  describe('Blocked pairs logging', () => {
    test('Should log blocked pairs with details', () => {
      const usMarket = createMarket({
        id: 'kalshi-123',
        exchange: 'KALSHI',
        title: 'Trump election 2028'
      });

      const hondurasMarket = createMarket({
        id: 'poly-456',
        exchange: 'POLYMARKET',
        title: 'Honduras President 2028'
      });

      validator.validate(usMarket, hondurasMarket);

      const log = validator.getBlockedPairs();
      expect(log.length).toBe(1);
      expect(log[0].market1).toBe('KALSHI:kalshi-123');
      expect(log[0].market2).toBe('POLYMARKET:poly-456');
      expect(log[0].blocker).toBe('GeographicBlocker');
      expect(log[0].reason).toContain('honduras');
    });

    test('Should accumulate multiple blocked pairs', () => {
      const us1 = createMarket({ id: 'm1', title: 'US election' });
      const honduras = createMarket({ id: 'm2', title: 'Honduras election' });
      const mexico = createMarket({ id: 'm3', title: 'Mexico election' });

      validator.validate(us1, honduras);
      validator.validate(us1, mexico);

      const log = validator.getBlockedPairs();
      expect(log.length).toBe(2);
    });

    test('Should clear log when requested', () => {
      const us = createMarket({ title: 'US election' });
      const honduras = createMarket({ title: 'Honduras election' });

      validator.validate(us, honduras);
      expect(validator.getBlockedPairs().length).toBe(1);

      validator.clearBlockedLog();
      expect(validator.getBlockedPairs().length).toBe(0);
    });
  });

  describe('Edge cases and regression tests', () => {
    test('Original bug: Kalshi US implicit vs PredictIt Honduras explicit', () => {
      const kalshiMarket: Market = {
        id: 'KXPRES-28-DT',
        exchangeId: 'KXPRES-28-DT',
        exchange: 'KALSHI',
        title: 'Will Donald Trump win the 2028 presidential election?',
        description: '',
        active: true
      };

      const predictItMarket: Market = {
        id: 'honduras-pres',
        exchangeId: 'honduras-pres',
        exchange: 'PREDICTIT',
        title: 'Next president of Honduras?',
        description: 'Who will be the next president of Honduras?',
        active: true
      };

      const result = validator.validate(kalshiMarket, predictItMarket);
      expect(result.blocked).toBe(true);
      expect(result.blocker).toBe('GeographicBlocker');
    });

    test('Non-political markets without country should pass through', () => {
      const m1 = createMarket({
        exchange: 'POLYMARKET',
        title: 'Will Bitcoin reach $100k?'
      });

      const m2 = createMarket({
        exchange: 'POLYMARKET',
        title: 'BTC price prediction'
      });

      const result = validator.validate(m1, m2);
      expect(result.blocked).toBe(false);
    });

    test('Markets with USA abbreviation should be detected', () => {
      const usaMarket = createMarket({
        title: 'USA election 2028'
      });

      const franceMarket = createMarket({
        title: 'France election 2028'
      });

      const result = validator.validate(usaMarket, franceMarket);
      expect(result.blocked).toBe(true);
    });
  });
});
