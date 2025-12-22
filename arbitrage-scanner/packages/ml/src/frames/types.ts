export type QuestionType =
  | 'BINARY_EVENT'    // Will X happen?
  | 'WINNER'          // Who will win?
  | 'THRESHOLD'       // Will X exceed Y?
  | 'COUNT'           // How many times?
  | 'IDENTITY'        // Who is X?
  | 'COMPARISON'      // X vs Y
  | 'TIMING'          // When will X happen?
  | 'OCCURRENCE'      // Did X happen?
  | 'NOMINEE'         // Who will be nominated?
  | 'RUNNING'         // Will X run for Y?
  | 'VOTE_BEHAVIOR';  // Will X vote for Y?

export interface SemanticFrame {
  subject: string;
  action: string;
  object: string | null;
  modifier: string | null;
  polarity: 'positive' | 'negative' | 'neutral';
  questionType: QuestionType;
  confidence: number;
}

export interface FramePattern {
  name: string;
  pattern: RegExp;
  questionType: QuestionType;
  extractors: {
    subject?: number;
    action?: number;
    object?: number;
    modifier?: number;
  };
  polarity: 'positive' | 'negative' | 'neutral';
}

export interface FrameMatchResult {
  framesMatch: boolean;
  questionTypeMatch: boolean;
  subjectMatch: boolean;
  actionMatch: boolean;
  objectMatch: boolean;
  conflicts: FrameConflict[];
  confidence: number;
}

export interface FrameConflict {
  type: 'question_type' | 'subject' | 'action' | 'object' | 'polarity';
  frame1Value: string;
  frame2Value: string;
  reason: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}
