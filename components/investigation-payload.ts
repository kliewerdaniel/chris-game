import type { FactStatus } from "../lib/core/types";

/** Shape returned by /api/investigation — the player's consistency board. */
export interface InvestigationPayload {
  episodeId: string;
  timelines?: string[];
  established: string[];
  discovered: string[];
  corroboration: {
    factId: string;
    status?: FactStatus;
    verdict: string;
    supporters: number;
    contradictors: number;
    timelines?: string[];
  }[];
  visibleContradictions: { factId: string; report: string; claimLabels: string[]; timelines?: string[] }[];
  openLeads: { factId: string; label: string; degree: number }[];
  /** ADR-014 Phase C — actionable divergence alerts (canonical ⊣ mythos tension). */
  divergenceAlerts: {
    factId: string;
    report: string;
    strongerSource?: string;
    weakerSource?: string;
  }[];
}
