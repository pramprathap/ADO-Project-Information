import type { PortfolioSummary } from './ProjectReport';

/** RAG delivery status for a project in the portfolio. */
export type Rag = 'on' | 'risk' | 'off';

export interface AttnReason {
  t: string;
  /** 'red' = off-track / overdue, 'amber' = at-risk. */
  tone: 'red' | 'amber';
}

/** A project merged with its Project Information + Boards roll-up for Overview. */
export interface PortfolioProject {
  id: string;
  name: string;
  lead: string;
  /** Project Type display label. */
  type: string;
  /** Raw Project Type value. */
  typeRaw: string;
  /** Short region code (e.g. NA, EMEA, India, Internal). */
  region: string;
  client: string;
  /** Project Status display label. */
  status: string;
  statusRaw: string;
  health: '' | 'Green' | 'Amber' | 'Red';
  billable: boolean;
  plannedStart?: string;
  plannedDue?: string;
  progress: number;
  rag: Rag;
  isOverdue: boolean;
  overdueDays: number;
  reasons: AttnReason[];
  summary: PortfolioSummary;
}
