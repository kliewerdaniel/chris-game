/**
 * Single source of truth for the consistency-board shape.
 *
 * The interface was previously duplicated (declared here AND in
 * `lib/core/investigation.ts`), which let the two drift — see ADR-014 §1. This
 * file now re-exports the canonical `InvestigationPayload` from the engine so
 * there is exactly one definition. The `buildInvestigationPayload` /
 * `aggregateInvestigation` producers in `lib/core/investigation.ts` type their
 * return against this same interface.
 */
export type { InvestigationPayload } from "../lib/core/investigation";
