import { describe, test, expect } from 'vitest';
import { KalshiTickerParser } from '../parsers/KalshiTickerParser';
import { HardBlockerValidator } from '../validators/HardBlockerValidator';
import { Market } from '@arb/core';

describe('KalshiTickerParser', () => {
  const parser = new KalshiTickerParser();

  describe('VP Nominee Detection', () => {
    test('KXVPRESNOMR-28-JDV should parse as VP NOMINEE', () => {
      const result = parser.parse('KXVPRESNOMR-28-JDV');
      expect(result.positionType).toBe('VICE_PRESIDENT');
      expect(result.eventType).toBe('NOMINEE');
      expect(result.year).toBe(2028);
      expect(result.party).toBe('REPUBLICAN');
      expect(result.candidateCode).toBe('JDV');
      expect(result.confidence).toBe(1.0);
    });

    test('KXVPRESNOMD-28-ABC should parse as VP NOMINEE Democrat', () => {
      const result = parser.parse('KXVPRESNOMD-28-ABC');
      expect(result.positionType).toBe('VICE_PRESIDENT');
      expect(result.eventType).toBe('NOMINEE');
      expect(result.party).toBe('DEMOCRAT');
    });
  });

  describe('President Nominee Detection', () => {
    test('KXPRESNOMR-28-DT should parse as PRESIDENT NOMINEE', () => {
      const result = parser.parse('KXPRESNOMR-28-DT');
      expect(result.positionType).toBe('PRESIDENT');
      expect(result.eventType).toBe('NOMINEE');
      expect(result.year).toBe(2028);
      expect(result.party).toBe('REPUBLICAN');
    });

    test('KXPRESNOMD-28-JB should parse as PRESIDENT NOMINEE Democrat', () => {
      const result = parser.parse('KXPRESNOMD-28-JB');
      expect(result.positionType).toBe('PRESIDENT');
      expect(result.eventType).toBe('NOMINEE');
      expect(result.party).toBe('DEMOCRAT');
    });
  });

  describe('Position Mismatch Detection', () => {
    test('VP ticker vs President ticker should detect mismatch', () => {
      expect(parser.isPositionMismatch('KXVPRESNOMR-28-JDV', 'KXPRESNOMR-28-DT')).toBe(true);
    });

    test('Same position type should not mismatch', () => {
      expect(parser.isPositionMismatch('KXPRESNOMR-28-DT', 'KXPRESNOMR-28-TC')).toBe(false);
    });
  });

  describe('Person-Specific President Markets', () => {
    test('KXPERSONPRESMAM-45 should parse as PRESIDENT', () => {
      const result = parser.parse('KXPERSONPRESMAM-45');
      expect(result.positionType).toBe('PRESIDENT');
      expect(result.eventType).toBe('WINNER');
      expect(result.year).toBe(2045);
      expect(result.candidateCode).toBe('MAM');
    });
  });

  describe('Heuristic Fallback', () => {
    test('Unknown ticker with VP should heuristically detect VP', () => {
      const result = parser.parse('KXUNKNOWNVPTEST-28');
      expect(result.positionType).toBe('VICE_PRESIDENT');
      expect(result.confidence).toBeLessThan(1.0);
    });

    test('Unknown ticker with PRES should heuristically detect PRESIDENT', () => {
      const result = parser.parse('KXUNKNOWNPRESTEST-28');
      expect(result.positionType).toBe('PRESIDENT');
      expect(result.confidence).toBeLessThan(1.0);
    });
  });
});

describe('HardBlockerValidator', () => {
  const validator = new HardBlockerValidator();

  const createMarket = (overrides: Partial<Market>): Market => ({
    id: 'test-id',
    exchangeId: 'test-id',
    exchange: 'KALSHI',
    title: 'Test Market',
    description: '',
    active: true,
    ...overrides
  });

  describe('Position Type Blocking', () => {
    test('VP market vs President market should be BLOCKED', () => {
      const vpMarket = createMarket({
        id: 'KXVPRESNOMR-28-JDV',
        title: 'Will J.D. Vance be the nominee for the Vice Presidency for the Republican party in 2028?',
        positionType: 'VICE_PRESIDENT'
      });

      const presMarket = createMarket({
        id: '8152-31925',
        exchange: 'PREDICTIT',
        title: 'Republican presidential nominee in 2028?: Cruz',
        description: 'Who will be the Republican presidential nominee in 2028?'
      });

      const result = validator.validate(vpMarket, presMarket);
      expect(result.blocked).toBe(true);
      expect(result.severity).toBe('CRITICAL');
      expect(result.reason).toContain('VICE_PRESIDENT');
      expect(result.reason).toContain('PRESIDENT');
    });

    test('Same position type (President vs President) should NOT be blocked', () => {
      const pres1 = createMarket({
        title: 'Will Trump win the 2028 Presidential election?',
        positionType: 'PRESIDENT'
      });

      const pres2 = createMarket({
        exchange: 'PREDICTIT',
        title: '2028 Presidential Election: Trump',
        description: 'Will Donald Trump win the 2028 presidential election?'
      });

      const result = validator.validate(pres1, pres2);
      expect(result.blocked).toBe(false);
    });

    test('Text-based VP detection should work', () => {
      const vpMarket = createMarket({
        title: 'Who will be the Vice President after 2028 election?'
      });

      const presMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Next US President in 2028'
      });

      const result = validator.validate(vpMarket, presMarket);
      expect(result.blocked).toBe(true);
    });
  });

  describe('Geographic Blocking', () => {
    test('US market vs Honduras market should be BLOCKED', () => {
      const usMarket = createMarket({
        title: 'Will Trump become President of the United States?',
        description: 'This market resolves based on the US presidential election.'
      });

      const hondurasMarket = createMarket({
        exchange: 'PREDICTIT',
        title: 'Next president of Honduras?: Nasralla',
        description: 'Who will be the next president of Honduras?'
      });

      const result = validator.validate(usMarket, hondurasMarket);
      expect(result.blocked).toBe(true);
      expect(result.severity).toBe('CRITICAL');
      expect(result.reason).toContain('honduras'); // Geographic mismatch
    });

    test('Same country (US vs US) should NOT be blocked', () => {
      const us1 = createMarket({
        title: 'Will Trump win the 2028 US Presidential election?'
      });

      const us2 = createMarket({
        exchange: 'POLYMARKET',
        title: 'Who wins 2028 US presidency?'
      });

      const result = validator.validate(us1, us2);
      expect(result.blocked).toBe(false);
    });
  });

  describe('Year Blocking', () => {
    test('2024 vs 2028 markets should be BLOCKED (4 years apart)', () => {
      const market2024 = createMarket({
        id: 'KXPRES-24',
        title: 'Will Biden win the 2024 election?',
        year: 2024
      });

      const market2028 = createMarket({
        id: 'KXPRES-28',
        title: 'Will Trump win the 2028 election?',
        year: 2028
      });

      const result = validator.validate(market2024, market2028);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Year');
    });

    test('Same year should NOT be blocked', () => {
      const market1 = createMarket({
        title: 'Who wins 2028 Republican primary?',
        year: 2028
      });

      const market2 = createMarket({
        title: '2028 GOP nominee',
        year: 2028
      });

      const result = validator.validate(market1, market2);
      // Should not be blocked for year mismatch
      expect(result.reason).not.toContain('Year');
    });
  });

  describe('Party Blocking', () => {
    test('Republican only vs Democrat only should be BLOCKED', () => {
      const repMarket = createMarket({
        title: 'Republican presidential nominee 2028',
        party: 'REPUBLICAN'
      });

      const demMarket = createMarket({
        exchange: 'PREDICTIT',
        title: 'Democratic presidential nominee 2028'
      });

      const result = validator.validate(repMarket, demMarket);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Party');
    });
  });

  describe('Event Type Blocking', () => {
    test('Nominee vs Winner should be BLOCKED', () => {
      const nomineeMarket = createMarket({
        title: 'Who will be the Republican nominee in 2028?',
        eventType: 'NOMINEE'
      });

      const winnerMarket = createMarket({
        exchange: 'POLYMARKET',
        title: 'Who will win the 2028 presidential election?',
        eventType: 'WINNER'
      });

      const result = validator.validate(nomineeMarket, winnerMarket);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Event type');
    });
  });

  describe('Edge Cases', () => {
    test('Vice Presidential election vs Presidential election - text only', () => {
      const vpMarket = createMarket({
        title: 'Vice Presidential running mate selection',
        description: 'Who will be chosen as VP candidate?'
      });

      const presMarket = createMarket({
        title: 'Presidential candidate announcement',
        description: 'Who will run for president?'
      });

      const result = validator.validate(vpMarket, presMarket);
      expect(result.blocked).toBe(true);
    });

    test('Markets with no position indicators should NOT be blocked by position', () => {
      const market1 = createMarket({
        title: 'Will GDP grow in 2028?'
      });

      const market2 = createMarket({
        title: 'Economic growth in 2028'
      });

      const result = validator.validate(market1, market2);
      // Should not be blocked for position type (no position detected)
      expect(result.blocked).toBe(false);
    });
  });
});

describe('Integration: VP vs President Mismatch (Original Bug)', () => {
  const validator = new HardBlockerValidator();

  test('KXVPRESNOMR-28-JDV vs PredictIt 8152-31925 should be BLOCKED', () => {
    const kalshiVP: Market = {
      id: 'KXVPRESNOMR-28-JDV',
      exchangeId: 'KXVPRESNOMR-28-JDV',
      exchange: 'KALSHI',
      title: 'Will J.D. Vance be the nominee for the Vice Presidency for the Republican party in 2028?',
      description: 'This market resolves YES if J.D. Vance is nominated as the Vice Presidential candidate.',
      active: true,
      positionType: 'VICE_PRESIDENT',
      eventType: 'NOMINEE',
      year: 2028,
      party: 'REPUBLICAN'
    };

    const predictItPres: Market = {
      id: '8152-31925',
      exchangeId: '8152-31925',
      exchange: 'PREDICTIT',
      title: 'Republican presidential nominee in 2028?: Cruz',
      description: 'Who will be the Republican presidential nominee in 2028?',
      active: true
    };

    const result = validator.validate(kalshiVP, predictItPres);

    expect(result.blocked).toBe(true);
    expect(result.severity).toBe('CRITICAL');
    expect(result.reason).toContain('Position type mismatch');
    expect(result.reason).toContain('VICE_PRESIDENT');
    expect(result.reason).toContain('PRESIDENT');
  });
});
