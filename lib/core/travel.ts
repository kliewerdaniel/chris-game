import { WorldState } from "./types";
import { cloneWorldState } from "./world";

/**
 * TRAVEL JOURNAL (ADR-003) — non-destructive episode rewind.
 *
 * The journal is CLIENT-OWNED and contains a snapshot of the player's WorldState
 * for each episode they have entered. Snapshots are written ONLY on live events
 * (entering an episode, a live turn, or an episode completing) — never while the
 * player is *replaying* a traveled-to episode. This keeps travel strictly
 * non-destructive: the forward timeline (the live frontier) is always the
 * authoritative progress, and replay mutations are discarded when the player
 * returns to the live story.
 *
 * Travel rules:
 *  - A completed episode may be revisited at any time.
 *  - After ep4 closes (`ep4.closed`), every episode becomes free-travel.
 *  - Restoring a snapshot hands back a CLONE so the caller can't mutate the
 *    stored snapshot by reference.
 */

export interface EpisodeSnapshot {
  episodeId: string;
  /** full world state at capture time (clone-safe; treated as immutable). */
  state: WorldState;
  isComplete: boolean;
  completedAt?: number;
}

export interface TravelJournal {
  /** episode id -> snapshot. */
  snapshots: Record<string, EpisodeSnapshot>;
  /** the furthest-reached / currently-live episode (authoritative progress). */
  liveEpisodeId: string | null;
  /** unlocked once ep4.closed is reached. */
  freeTravel: boolean;
}

export function createJournal(): TravelJournal {
  return { snapshots: {}, liveEpisodeId: null, freeTravel: false };
}

/** Capture / refresh the LIVE frontier snapshot. Called on enter + every live turn. */
export function captureLive(journal: TravelJournal, state: WorldState): TravelJournal {
  const ep = state.episodeId;
  const prev = journal.snapshots[ep];
  return {
    ...journal,
    liveEpisodeId: ep,
    snapshots: {
      ...journal.snapshots,
      [ep]: {
        episodeId: ep,
        state,
        isComplete: prev?.isComplete ?? false,
        completedAt: prev?.completedAt,
      },
    },
  };
}

/** Mark the current live episode complete. Unlocks free travel if ep4 closes. */
export function markComplete(journal: TravelJournal, state: WorldState, endingId?: string): TravelJournal {
  const ep = state.episodeId;
  const existing = journal.snapshots[ep] ?? { episodeId: ep, state, isComplete: false };
  const freeTravel = journal.freeTravel || endingId === "ep4.closed";
  return {
    ...journal,
    freeTravel,
    snapshots: {
      ...journal.snapshots,
      [ep]: { ...existing, state, isComplete: true, completedAt: Date.now() },
    },
  };
}

export function canTravelTo(journal: TravelJournal, episodeId: string): boolean {
  const snap = journal.snapshots[episodeId];
  if (!snap) return false;
  // Reachable if: free travel is on, the episode is completed, or it's the
  // current live frontier (clicking the active chip just re-enters where you are).
  return journal.freeTravel || snap.isComplete || snap.episodeId === journal.liveEpisodeId;
}

export function isFreeTravel(journal: TravelJournal): boolean {
  return journal.freeTravel;
}

/** Return a clone of the snapshot state for travel, or null if not allowed. */
export function restore(journal: TravelJournal, episodeId: string): WorldState | null {
  if (!canTravelTo(journal, episodeId)) return null;
  return cloneWorldState(journal.snapshots[episodeId].state);
}

/** Every snapshot's WorldState — used by the cross-timeline board. */
export function allSnapshotStates(journal: TravelJournal): WorldState[] {
  return Object.values(journal.snapshots).map((s) => s.state);
}
