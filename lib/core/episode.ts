import {
  WorldState,
  GameAction,
  ActionResult,
  NarrationLine,
} from "./types";
import { CharacterEngine } from "../characters/engine";

/**
 * Episode framework.
 *
 * Episodes are DECLARATIVE CONTENT, not code in the engine. Each episode
 * provides: a setup step (fresh WorldState for that episode), dispatch of
 * game verbs to deterministic handlers, and a completion check. The shared
 * GameEngine owns all state transitions and the local-inference voicing; an
 * episode only decides *what* happens deterministically when the player acts
 * inside it.
 *
 * Continuity is explicit: `setup(state)` receives the PREVIOUS episode's final
 * WorldState (or a `carry` bundle), so trust, evidence, and known facts flow
 * forward. The engine decides when an episode is complete and hands control to
 * the next via `next`.
 */

export interface EpisodeContext {
  engine: GameEngineApi;
  ce: CharacterEngine;
}

/** Minimal engine surface episodes are allowed to use (no free-form mutation). */
export interface GameEngineApi {
  buildNarration: (
    state: WorldState,
    action: GameAction,
    result: ActionResult
  ) => Promise<NarrationLine[]>;
}

export type EpisodeHandler = (
  state: WorldState,
  action: GameAction,
  ctx: EpisodeContext
) => Promise<{ state: WorldState; result: ActionResult }> | { state: WorldState; result: ActionResult };

export interface Episode {
  id: string;
  index: number;
  title: string;
  /** one-line subtitle shown in the UI header. */
  subtitle: string;
  /** the next episode id, or null if this is the finale. */
  next: string | null;
  /**
   * Produce the starting WorldState for this episode. `carry` is the previous
   * episode's final state (used to preserve trust, evidence, known facts).
   */
  setup: (carry?: WorldState) => WorldState;
  /**
   * Dispatch a player action to a deterministic handler. Must decide whether
   * the action belongs to this episode. Return `null` to fall through to a
   * shared handler.
   */
  dispatch: (
    action: GameAction,
    ctx: EpisodeContext
  ) => EpisodeHandler | null;
  /**
   * Determine if the current state completes the episode. Returns the ending
   * id when complete, else null.
   */
  isComplete: (state: WorldState) => string | null;
}

/** A single beat of narration authored directly in an episode (no model). */
export function beat(
  text: string,
  speaker: NarrationLine["speaker"] = "narrator",
  status: NarrationLine["status"] = "canonical"
): NarrationLine {
  return { speaker, text, status };
}
