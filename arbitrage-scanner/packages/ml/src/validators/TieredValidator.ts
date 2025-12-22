import { Market } from '@arb/core';
import { HardBlockerValidator, HardBlockerResult } from './HardBlockerValidator.js';
import { EntityExtractor, EntityMatchResult } from '../ner/index.js';
import { SemanticFramer, FrameMatchResult } from '../frames/index.js';

export type ValidationTier = 0 | 1 | 2 | 3 | 4;

export interface TierResult {
  tier: ValidationTier;
  passed: boolean;
  reason?: string;
  confidence: number;
  details?: Record<string, unknown>;
}

export interface TieredValidationResult {
  valid: boolean;
  stoppedAtTier: ValidationTier;
  tierResults: TierResult[];
  overallConfidence: number;
  blockingReason?: string;
}

export interface TieredValidatorConfig {
  maxTier?: ValidationTier;
  minConfidence?: number;
  enableEntityExtraction?: boolean;
  enableSemanticFraming?: boolean;
  enableEmbeddings?: boolean;
}

const DEFAULT_CONFIG: TieredValidatorConfig = {
  maxTier: 3,
  minConfidence: 0.5,
  enableEntityExtraction: true,
  enableSemanticFraming: true,
  enableEmbeddings: false
};

export class TieredValidator {
  private hardBlockerValidator: HardBlockerValidator;
  private entityExtractor: EntityExtractor;
  private semanticFramer: SemanticFramer;
  private config: TieredValidatorConfig;

  constructor(config: Partial<TieredValidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hardBlockerValidator = new HardBlockerValidator();
    this.entityExtractor = new EntityExtractor();
    this.semanticFramer = new SemanticFramer();
  }

  validate(market1: Market, market2: Market): TieredValidationResult {
    const tierResults: TierResult[] = [];
    let overallConfidence = 1.0;

    // Tier 0: Quick price/category pre-filter (should already be done)
    const tier0Result = this.tier0QuickFilter(market1, market2);
    tierResults.push(tier0Result);
    if (!tier0Result.passed) {
      return {
        valid: false,
        stoppedAtTier: 0,
        tierResults,
        overallConfidence: tier0Result.confidence,
        blockingReason: tier0Result.reason
      };
    }
    overallConfidence *= tier0Result.confidence;

    // Tier 1: Hard blockers (existing validation)
    const tier1Result = this.tier1HardBlockers(market1, market2);
    tierResults.push(tier1Result);
    if (!tier1Result.passed) {
      return {
        valid: false,
        stoppedAtTier: 1,
        tierResults,
        overallConfidence: tier1Result.confidence,
        blockingReason: tier1Result.reason
      };
    }
    overallConfidence *= tier1Result.confidence;

    if (this.config.maxTier! < 2) {
      return { valid: true, stoppedAtTier: 1, tierResults, overallConfidence };
    }

    // Tier 2: Entity extraction and matching
    if (this.config.enableEntityExtraction) {
      const tier2Result = this.tier2EntityMatch(market1, market2);
      tierResults.push(tier2Result);
      if (!tier2Result.passed) {
        return {
          valid: false,
          stoppedAtTier: 2,
          tierResults,
          overallConfidence: tier2Result.confidence,
          blockingReason: tier2Result.reason
        };
      }
      overallConfidence *= tier2Result.confidence;
    }

    if (this.config.maxTier! < 3) {
      return { valid: true, stoppedAtTier: 2, tierResults, overallConfidence };
    }

    // Tier 3: Semantic frame matching
    if (this.config.enableSemanticFraming) {
      const tier3Result = this.tier3SemanticFrame(market1, market2);
      tierResults.push(tier3Result);
      if (!tier3Result.passed) {
        return {
          valid: false,
          stoppedAtTier: 3,
          tierResults,
          overallConfidence: tier3Result.confidence,
          blockingReason: tier3Result.reason
        };
      }
      overallConfidence *= tier3Result.confidence;
    }

    return {
      valid: true,
      stoppedAtTier: this.config.maxTier!,
      tierResults,
      overallConfidence
    };
  }

  private tier0QuickFilter(market1: Market, market2: Market): TierResult {
    // Category overlap check
    if (market1.categories && market2.categories) {
      const overlap = market1.categories.some(c => market2.categories!.includes(c));
      if (!overlap) {
        return {
          tier: 0,
          passed: false,
          reason: 'No category overlap',
          confidence: 0.1
        };
      }
    }

    // Year check
    if (market1.year && market2.year && Math.abs(market1.year - market2.year) > 1) {
      return {
        tier: 0,
        passed: false,
        reason: `Year mismatch: ${market1.year} vs ${market2.year}`,
        confidence: 0.1
      };
    }

    return { tier: 0, passed: true, confidence: 1.0 };
  }

  private tier1HardBlockers(market1: Market, market2: Market): TierResult {
    const result: HardBlockerResult = this.hardBlockerValidator.validate(market1, market2);

    if (result.blocked) {
      return {
        tier: 1,
        passed: false,
        reason: result.reason || 'Hard blocker triggered',
        confidence: 0.1,
        details: { blocker: result.blocker, severity: result.severity }
      };
    }

    return { tier: 1, passed: true, confidence: 0.9 };
  }

  private tier2EntityMatch(market1: Market, market2: Market): TierResult {
    try {
      const entities1 = this.entityExtractor.extract(market1.title);
      const entities2 = this.entityExtractor.extract(market2.title);
      const result: EntityMatchResult = this.entityExtractor.compareEntities(entities1, entities2);

      if (!result.entitiesMatch) {
        const criticalConflict = result.conflicts.find(c => c.severity === 'critical');
        if (criticalConflict) {
          return {
            tier: 2,
            passed: false,
            reason: criticalConflict.reason,
            confidence: 0.1,
            details: { conflicts: result.conflicts }
          };
        }
      }

      return {
        tier: 2,
        passed: true,
        confidence: result.confidence,
        details: {
          personOverlap: result.personOverlap,
          locationOverlap: result.locationOverlap,
          dateOverlap: result.dateOverlap
        }
      };
    } catch {
      return { tier: 2, passed: true, confidence: 0.5 };
    }
  }

  private tier3SemanticFrame(market1: Market, market2: Market): TierResult {
    try {
      const frame1 = this.semanticFramer.extractFrame(market1.title);
      const frame2 = this.semanticFramer.extractFrame(market2.title);
      const result: FrameMatchResult = this.semanticFramer.compareFrames(frame1, frame2);

      if (!result.framesMatch) {
        const criticalConflict = result.conflicts.find(c => c.severity === 'critical');
        if (criticalConflict) {
          return {
            tier: 3,
            passed: false,
            reason: criticalConflict.reason,
            confidence: 0.1,
            details: {
              frame1: frame1?.questionType,
              frame2: frame2?.questionType,
              conflicts: result.conflicts
            }
          };
        }
      }

      return {
        tier: 3,
        passed: true,
        confidence: result.confidence,
        details: {
          questionTypeMatch: result.questionTypeMatch,
          subjectMatch: result.subjectMatch,
          actionMatch: result.actionMatch
        }
      };
    } catch {
      return { tier: 3, passed: true, confidence: 0.5 };
    }
  }

  getStats(): { hardBlockerStats: ReturnType<HardBlockerValidator['getBlockedPairs']> } {
    return {
      hardBlockerStats: this.hardBlockerValidator.getBlockedPairs()
    };
  }

  clearStats(): void {
    this.hardBlockerValidator.clearBlockedLog();
  }
}

export const tieredValidator = new TieredValidator();
