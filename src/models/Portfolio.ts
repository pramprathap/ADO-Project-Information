import type { PortfolioSummary } from './ProjectReport';

/** RAG delivery status for a project in the portfolio. */
export type Rag = 'on' | 'risk' | 'off';

export interface AttnReason {
  t: string;
  /** 'red' = off-track / overdue, 'amber' = at-risk. */
  tone: 'red' | 'amber';
}

/**
 * Attention priority for the "Needs attention" ranking: how urgent the state is
 * (schedule, blockers, aging, rework, close-out) × how much the project matters
 * (Development > Support > … , client & fixed-price weighted up).
 */
export interface AttentionScore {
  /** Final priority = urgency × importance, 0..100. */
  score: number;
  /** Raw urgency 0..100 before importance weighting. */
  urgency: number;
  /** Importance multiplier (project type · client · billing). */
  multiplier: number;
  /** Human-readable factor lines (for the tooltip / audit). */
  breakdown: string[];
  /** True when this is a "push to closure" quick win (≥85% done, few items). */
  closeOut: boolean;
}

/** A project merged with its Project Information + Boards roll-up for Overview. */
export interface PortfolioProject {
  id: string;
  name: string;
  lead: string;
  /** Billing Type display label (shown in the Type column). */
  type: string;
  /** Raw Billing Type value. */
  typeRaw: string;
  /** Raw Project Type value (Development / Support / Internship / …). */
  projectTypeRaw: string;
  /** Short region code (e.g. NA, EMEA, India, Internal). */
  region: string;
  client: string;
  /** Project Status display label. */
  status: string;
  statusRaw: string;
  /** Raw Current Phase value from Project Information (e.g. "Closed"). */
  phaseRaw: string;
  health: '' | 'Green' | 'Amber' | 'Red';
  billable: boolean;
  /**
   * Internal / learning / internship work (by Project Type, billing, or a
   * name/client heuristic when Project Information isn't filled). These are
   * excluded from the Needs-attention ranking — client delivery first.
   */
  isInternalish: boolean;
  plannedStart?: string;
  plannedDue?: string;
  /** Actual/Revised end date when set, else the planned end date. */
  closureDate?: string;
  progress: number;
  rag: Rag;
  isOverdue: boolean;
  overdueDays: number;
  reasons: AttnReason[];
  attention: AttentionScore;
  summary: PortfolioSummary;
}
