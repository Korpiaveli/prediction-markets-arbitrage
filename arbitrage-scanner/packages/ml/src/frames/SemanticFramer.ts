import {
  SemanticFrame,
  FramePattern,
  FrameMatchResult,
  FrameConflict,
  QuestionType
} from './types.js';

const FRAME_PATTERNS: FramePattern[] = [
  // WINNER patterns
  {
    name: 'who_will_win',
    pattern: /(?:who|which\s+(?:party|candidate))\s+will\s+win\s+(?:the\s+)?(.+?)(?:\?|$)/i,
    questionType: 'WINNER',
    extractors: { object: 1 },
    polarity: 'neutral'
  },
  {
    name: 'will_win',
    pattern: /will\s+(.+?)\s+win\s+(?:the\s+)?(.+?)(?:\?|$)/i,
    questionType: 'WINNER',
    extractors: { subject: 1, object: 2 },
    polarity: 'positive'
  },
  {
    name: 'winner_of',
    pattern: /(?:winner|winning)\s+(?:of|in)\s+(?:the\s+)?(.+?)(?:\?|:|$)/i,
    questionType: 'WINNER',
    extractors: { object: 1 },
    polarity: 'neutral'
  },

  // NOMINEE patterns
  {
    name: 'will_be_nominee',
    pattern: /will\s+(.+?)\s+(?:be|become)\s+(?:the\s+)?(?:.*?)nominee/i,
    questionType: 'NOMINEE',
    extractors: { subject: 1 },
    polarity: 'positive'
  },
  {
    name: 'who_nominee',
    pattern: /(?:who|which)\s+.*\s+nominee(?:\?|:|$)/i,
    questionType: 'NOMINEE',
    extractors: {},
    polarity: 'neutral'
  },
  {
    name: 'nominee_colon',
    pattern: /nominee\s*:\s*(.+?)(?:\?|$)/i,
    questionType: 'NOMINEE',
    extractors: { subject: 1 },
    polarity: 'neutral'
  },

  // RUNNING patterns
  {
    name: 'will_run_for',
    pattern: /will\s+(.+?)\s+run\s+(?:for|in)\s+(?:the\s+)?(.+?)(?:\?|$)/i,
    questionType: 'RUNNING',
    extractors: { subject: 1, object: 2 },
    polarity: 'positive'
  },
  {
    name: 'running_for',
    pattern: /(.+?)\s+running\s+for\s+(?:the\s+)?(.+?)(?:\?|$)/i,
    questionType: 'RUNNING',
    extractors: { subject: 1, object: 2 },
    polarity: 'positive'
  },

  // THRESHOLD patterns
  {
    name: 'above_threshold',
    pattern: /(.+?)\s+(?:above|over|exceed(?:s|ing)?)\s+([\d.]+%?)/i,
    questionType: 'THRESHOLD',
    extractors: { subject: 1, modifier: 2 },
    polarity: 'positive'
  },
  {
    name: 'below_threshold',
    pattern: /(.+?)\s+(?:below|under)\s+([\d.]+%?)/i,
    questionType: 'THRESHOLD',
    extractors: { subject: 1, modifier: 2 },
    polarity: 'negative'
  },
  {
    name: 'at_least',
    pattern: /(?:at\s+least|no\s+fewer\s+than)\s+([\d.]+)/i,
    questionType: 'THRESHOLD',
    extractors: { modifier: 1 },
    polarity: 'positive'
  },

  // COUNT patterns
  {
    name: 'how_many_times',
    pattern: /how\s+many\s+times\s+will\s+(.+?)\s+(.+?)(?:\?|$)/i,
    questionType: 'COUNT',
    extractors: { subject: 1, action: 2 },
    polarity: 'neutral'
  },
  {
    name: 'number_of',
    pattern: /(?:number|total)\s+of\s+(.+?)\s+(?:in|during|for)\s+(.+?)(?:\?|$)/i,
    questionType: 'COUNT',
    extractors: { subject: 1, modifier: 2 },
    polarity: 'neutral'
  },
  {
    name: 'n_times',
    pattern: /(\d+)\s+times?\b/i,
    questionType: 'COUNT',
    extractors: { modifier: 1 },
    polarity: 'neutral'
  },

  // VOTE_BEHAVIOR patterns
  {
    name: 'will_vote_for',
    pattern: /will\s+(.+?)\s+vote\s+(?:for|against)\s+(.+?)(?:\?|$)/i,
    questionType: 'VOTE_BEHAVIOR',
    extractors: { subject: 1, object: 2 },
    polarity: 'positive'
  },
  {
    name: 'voting_for',
    pattern: /(.+?)\s+voting\s+(?:for|against)\s+(.+?)(?:\?|$)/i,
    questionType: 'VOTE_BEHAVIOR',
    extractors: { subject: 1, object: 2 },
    polarity: 'positive'
  },

  // BINARY_EVENT patterns
  {
    name: 'will_happen',
    pattern: /will\s+(?:the\s+)?(.+?)\s+(?:happen|occur|take\s+place)(?:\?|$)/i,
    questionType: 'BINARY_EVENT',
    extractors: { subject: 1 },
    polarity: 'positive'
  },
  {
    name: 'will_subject_verb',
    pattern: /will\s+(.+?)\s+(resign|visit|travel|announce|impeach|pardon|endorse)/i,
    questionType: 'BINARY_EVENT',
    extractors: { subject: 1, action: 2 },
    polarity: 'positive'
  },

  // TIMING patterns
  {
    name: 'by_date',
    pattern: /(?:by|before)\s+(?:the\s+end\s+of\s+)?(\w+\s+\d{4}|\d{4})/i,
    questionType: 'TIMING',
    extractors: { modifier: 1 },
    polarity: 'neutral'
  },
  {
    name: 'when_will',
    pattern: /when\s+will\s+(.+?)\s+(.+?)(?:\?|$)/i,
    questionType: 'TIMING',
    extractors: { subject: 1, action: 2 },
    polarity: 'neutral'
  },

  // COMPARISON patterns
  {
    name: 'vs_comparison',
    pattern: /(.+?)\s+vs\.?\s+(.+?)(?:\?|$)/i,
    questionType: 'COMPARISON',
    extractors: { subject: 1, object: 2 },
    polarity: 'neutral'
  },
  {
    name: 'more_than',
    pattern: /(?:more|greater|higher)\s+than\s+(.+?)(?:\?|$)/i,
    questionType: 'COMPARISON',
    extractors: { object: 1 },
    polarity: 'positive'
  }
];

export class SemanticFramer {

  extractFrame(text: string): SemanticFrame | null {
    const lower = text.toLowerCase();

    for (const pattern of FRAME_PATTERNS) {
      const match = lower.match(pattern.pattern);
      if (match) {
        return this.buildFrame(match, pattern);
      }
    }

    return this.inferFrame(text);
  }

  private buildFrame(match: RegExpMatchArray, pattern: FramePattern): SemanticFrame {
    const { extractors } = pattern;

    return {
      subject: extractors.subject ? (match[extractors.subject] || '').trim() : '',
      action: extractors.action ? (match[extractors.action] || '').trim() : this.inferAction(pattern.questionType),
      object: extractors.object ? (match[extractors.object] || '').trim() : null,
      modifier: extractors.modifier ? (match[extractors.modifier] || '').trim() : null,
      polarity: pattern.polarity,
      questionType: pattern.questionType,
      confidence: 0.9
    };
  }

  private inferFrame(text: string): SemanticFrame | null {
    const lower = text.toLowerCase();

    if (/\bwinner?\b|\bwin\b|\belected?\b/.test(lower)) {
      return {
        subject: '',
        action: 'win',
        object: null,
        modifier: null,
        polarity: 'neutral',
        questionType: 'WINNER',
        confidence: 0.6
      };
    }

    if (/\bnominee?\b|\bnomination\b/.test(lower)) {
      return {
        subject: '',
        action: 'nominate',
        object: null,
        modifier: null,
        polarity: 'neutral',
        questionType: 'NOMINEE',
        confidence: 0.6
      };
    }

    if (/\brun(?:ning)?\s+for\b/.test(lower)) {
      return {
        subject: '',
        action: 'run',
        object: null,
        modifier: null,
        polarity: 'positive',
        questionType: 'RUNNING',
        confidence: 0.6
      };
    }

    if (/\d+\s*%|\babove\b|\bbelow\b|\bthreshold\b/.test(lower)) {
      return {
        subject: '',
        action: 'threshold',
        object: null,
        modifier: null,
        polarity: 'neutral',
        questionType: 'THRESHOLD',
        confidence: 0.5
      };
    }

    if (/\btimes?\b|\bhow\s+many\b|\bnumber\s+of\b/.test(lower)) {
      return {
        subject: '',
        action: 'count',
        object: null,
        modifier: null,
        polarity: 'neutral',
        questionType: 'COUNT',
        confidence: 0.5
      };
    }

    return null;
  }

  private inferAction(questionType: QuestionType): string {
    const actionMap: Record<QuestionType, string> = {
      'BINARY_EVENT': 'occur',
      'WINNER': 'win',
      'THRESHOLD': 'exceed',
      'COUNT': 'count',
      'IDENTITY': 'be',
      'COMPARISON': 'compare',
      'TIMING': 'happen',
      'OCCURRENCE': 'occur',
      'NOMINEE': 'nominate',
      'RUNNING': 'run',
      'VOTE_BEHAVIOR': 'vote'
    };
    return actionMap[questionType] || 'unknown';
  }

  compareFrames(frame1: SemanticFrame | null, frame2: SemanticFrame | null): FrameMatchResult {
    const conflicts: FrameConflict[] = [];

    if (!frame1 || !frame2) {
      return {
        framesMatch: true,
        questionTypeMatch: true,
        subjectMatch: true,
        actionMatch: true,
        objectMatch: true,
        conflicts: [],
        confidence: 0.5
      };
    }

    const questionTypeMatch = frame1.questionType === frame2.questionType;
    if (!questionTypeMatch) {
      const severity = this.getQuestionTypeConflictSeverity(frame1.questionType, frame2.questionType);
      if (severity !== 'low') {
        conflicts.push({
          type: 'question_type',
          frame1Value: frame1.questionType,
          frame2Value: frame2.questionType,
          reason: `Different question types: ${frame1.questionType} vs ${frame2.questionType}`,
          severity
        });
      }
    }

    const subjectMatch = this.stringsMatch(frame1.subject, frame2.subject);
    const actionMatch = frame1.action === frame2.action ||
                        this.actionsCompatible(frame1.action, frame2.action);
    const objectMatch = this.stringsMatch(frame1.object, frame2.object);

    if (frame1.polarity !== frame2.polarity &&
        frame1.polarity !== 'neutral' &&
        frame2.polarity !== 'neutral') {
      conflicts.push({
        type: 'polarity',
        frame1Value: frame1.polarity,
        frame2Value: frame2.polarity,
        reason: `Opposite polarity: ${frame1.polarity} vs ${frame2.polarity}`,
        severity: 'high'
      });
    }

    const hasCritical = conflicts.some(c => c.severity === 'critical');
    const hasHigh = conflicts.some(c => c.severity === 'high');

    return {
      framesMatch: !hasCritical && !hasHigh,
      questionTypeMatch,
      subjectMatch,
      actionMatch,
      objectMatch,
      conflicts,
      confidence: hasCritical ? 0.1 : hasHigh ? 0.4 : 0.8
    };
  }

  private getQuestionTypeConflictSeverity(type1: QuestionType, type2: QuestionType): 'critical' | 'high' | 'medium' | 'low' {
    const criticalConflicts: [QuestionType, QuestionType][] = [
      ['WINNER', 'NOMINEE'],
      ['WINNER', 'RUNNING'],
      ['NOMINEE', 'RUNNING'],
      ['COUNT', 'BINARY_EVENT'],
      ['COUNT', 'THRESHOLD'],
      ['WINNER', 'VOTE_BEHAVIOR'],
      ['NOMINEE', 'VOTE_BEHAVIOR']
    ];

    for (const [t1, t2] of criticalConflicts) {
      if ((type1 === t1 && type2 === t2) || (type1 === t2 && type2 === t1)) {
        return 'critical';
      }
    }

    const highConflicts: [QuestionType, QuestionType][] = [
      ['BINARY_EVENT', 'WINNER'],
      ['THRESHOLD', 'BINARY_EVENT'],
      ['TIMING', 'WINNER']
    ];

    for (const [t1, t2] of highConflicts) {
      if ((type1 === t1 && type2 === t2) || (type1 === t2 && type2 === t1)) {
        return 'high';
      }
    }

    return 'low';
  }

  private stringsMatch(s1: string | null, s2: string | null): boolean {
    if (!s1 && !s2) return true;
    if (!s1 || !s2) return false;

    const n1 = s1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n2 = s2.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (n1 === n2) return true;
    if (n1.includes(n2) || n2.includes(n1)) return true;

    return false;
  }

  private actionsCompatible(a1: string, a2: string): boolean {
    const equivalents: string[][] = [
      ['win', 'elected', 'elect'],
      ['nominate', 'nominee', 'nomination'],
      ['run', 'running', 'candidate'],
      ['occur', 'happen', 'take place'],
      ['exceed', 'above', 'over'],
      ['below', 'under', 'less than']
    ];

    for (const group of equivalents) {
      if (group.includes(a1) && group.includes(a2)) {
        return true;
      }
    }

    return false;
  }
}

export const semanticFramer = new SemanticFramer();
