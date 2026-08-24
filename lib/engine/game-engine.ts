import { WorldState, GameAction, ActionResult, NarrationLine } from "../core/types";
import {
  serializeWorldState,
  deserializeWorldState,
} from "../core/world";
import { FACTS } from "../core/facts";
import { getEvidenceDef } from "../core/evidence";
import { CHRIS, CHARACTERS } from "../characters/chris";
import { CharacterEngine, characterEngine } from "../characters/engine";
import { Retrieval, buildRetrievalFromMemories } from "../retrieval/retrieval";
import { Narrator } from "../narrative/narrator";
import { InferenceManager } from "../inference/provider";
import { parseAction, isConfident, RESOLVABLE_TARGET_IDS, RESOLVABLE_TOPIC_IDS } from "../inference/intent";
import { resolveIntentWithLLM, AllowedActions, ALL_VERBS } from "../inference/llm-intent";
import { Episode, EpisodeContext } from "../core/episode";
import { EPISODE1 } from "./episode1";
import { EPISODE2 } from "./episode2";
import { EPISODE3 } from "./episode3";
import { EPISODE4 } from "./episode4";
import { applyWorldEvents } from "./world-events";

export const EPISODES: Record<string, Episode> = {
  ep1: EPISODE1,
  ep2: EPISODE2,
  ep3: EPISODE3,
  ep4: EPISODE4,
};

export interface EngineDeps {
  retrieval: Retrieval;
  narrator: Narrator;
  inference: InferenceManager;
  characterEngine?: CharacterEngine;
}

/**
 * The deterministic engine. Owns all state transitions. Delegates per-episode
 * behavior to the active Episode (declarative content). The LLM is invoked only
 * through the Narrator, which returns prose the engine NEVER trusts to mutate
 * state. Any state change is explicit and rule-driven in the episode handlers.
 */
export class GameEngine {
  private ce: CharacterEngine;
  constructor(private deps: EngineDeps) {
    this.ce = deps.characterEngine ?? characterEngine;
  }

  /** Start a fresh playthrough at the given episode (default Ep1). */
  newGame(episodeId = "ep1"): WorldState {
    const ep = EPISODES[episodeId];
    if (!ep) throw new Error(`Unknown episode: ${episodeId}`);
    return ep.setup();
  }

  getEpisode(state: WorldState): Episode {
    return EPISODES[state.episodeId] ?? EPISODES.ep1;
  }

  /**
   * The closed id-space the LLM resolver is allowed to emit for this episode:
   * verbs the episode can handle, plus the reachable target/topic ids derived
   * from live world state (contacts, evidence) and the deterministic rule
   * matcher's known ids. Keeps the model's output inside what the engine can
   * actually execute (ADR-002 epistemic boundary).
   */
  private allowedFor(state: WorldState, ep: Episode): AllowedActions {
    const verbs = ALL_VERBS;
    const targetIds = Array.from(
      new Set([
        ...RESOLVABLE_TARGET_IDS,
        ...state.contacts.map((c) => c.id),
        ...state.evidenceIds.map((e) => String(e)),
        ...Object.keys(state.characterStates),
      ])
    );
    const topicIds = [...RESOLVABLE_TOPIC_IDS];
    return { verbs, targetIds, topicIds };
  }

  /**
   * Transition to the next episode, carrying continuity forward. Returns the
   * new episode's starting state (which itself imports the prior episode's
   * trust/evidence/knownFacts via its `setup(carry)`).
   */
  nextEpisode(state: WorldState): WorldState | null {
    const ep = this.getEpisode(state);
    if (!ep.next) return null;
    const next = EPISODES[ep.next];
    if (!next) return null;
    return next.setup(state);
  }

  /**
   * Process a player turn. Full runtime pipeline:
   *   input → parse → validate → episode dispatch → (voice) → narration →
   *   OUTPUT VALIDATION → (state transition already applied by episode).
   */
  async processTurn(state: WorldState, raw: string): Promise<{ state: WorldState; result: ActionResult; action: GameAction }> {
    // ADR-002: LLM is the primary resolver when opted in (CHRIS_USE_LLM_PARSE=1)
    // and a local model is reachable. The rule parser (`parseAction`) is ALWAYS
    // the fallback, and remains the default/offline path. The LLM's proposed
    // action is validated below against ep.dispatch EXACTLY like a rule output —
    // it is never trusted to mutate state directly.
    const ep = this.getEpisode(state);
    let action = parseAction(raw);

    if (process.env.CHRIS_USE_LLM_PARSE === "1" && this.deps.inference) {
      const allowed = this.allowedFor(state, ep);
      const llmAction = await resolveIntentWithLLM(raw, this.deps.inference, allowed);
      // Accept the LLM action only if the episode can actually handle its verb
      // (ep.dispatch returns a handler). Otherwise keep the rule output.
      const probe: EpisodeContext = { engine: this.engineApi(), ce: this.ce };
      if (llmAction && ep.dispatch(llmAction, probe)) {
        action = llmAction;
      }
    }

    if (!isConfident(action)) {
      return {
        state,
        action,
        result: {
          ok: false,
          reason: "I didn't catch that. Try 'look around', 'talk to Chris', or 'ask Chris about Sarge'.",
          narration: [],
          events: [],
        },
      };
    }

    const ctx: EpisodeContext = { engine: this.engineApi(), ce: this.ce };
    const handler = ep.dispatch(action, ctx);

    if (!handler) {
      // No handler for this verb in the active episode.
      return {
        state,
        action,
        result: {
          ok: false,
          reason: "You can't do that here. Try 'look around' or 'help'.",
          narration: [],
          events: [],
        },
      };
    }

    let { state: next, result } = await handler(state, action, ctx);

    // Apply deterministic scheduled world events against the post-action state.
    // Fired ids are idempotent (recorded in next.firedEventIds). These carry
    // seeded, canonical narration — the model never authors world happenings.
    const worldStep = applyWorldEvents(next);
    next = worldStep.state;

    // Voice character turns (talk/ask/confront) and safety-net empty narration.
    if (result.ok) {
      const needsVoice = ["talk", "ask", "confront"].includes(action.type);
      if (needsVoice || result.narration.length === 0) {
        const nar = await this.generateNarration(next, action, result);
        result = { ...result, narration: nar };
      }
    }

    return { state: next, result, action };
  }

  private engineApi() {
    return {
      buildNarration: async (
        state: WorldState,
        action: GameAction,
        result: ActionResult
      ): Promise<NarrationLine[]> => this.generateNarration(state, action, result),
    };
  }

  /** After a handler, generate model narration for character turns. */
  private async generateNarration(
    state: WorldState,
    action: GameAction,
    result: ActionResult
  ): Promise<NarrationLine[]> {
    const handling = (result.stateChanges as any)?.handling as
      | "truth"
      | "lie"
      | "withhold"
      | "unknown"
      | "testimony"
      | "narration"
      | undefined;
    const lieAbout = (result.stateChanges as any)?.lieAbout as string | undefined;
    const speaker = (result.stateChanges as any)?.speaker as string | undefined;
    const seed = (result.stateChanges as any)?.seed as string | undefined;
    const topicLabel = (result as any).topicLabel as string | undefined;

    if (!["talk", "ask", "confront"].includes(action.type)) return result.narration;

    // Determine which character voices this turn.
    let characterId: string | undefined;
    if (action.targetId === "chris" || action.targetId === "reconstruction" || action.targetId === "model") {
      characterId = action.targetId === "chris" ? "chris" : "chris"; // voiced via CHRIS def for now
    } else if (action.type === "confront") {
      characterId = "chris";
    }

    let lieText: string | undefined;
    if (handling === "lie" && lieAbout && CHRIS.knowledge.lies[lieAbout]) {
      lieText = CHRIS.knowledge.lies[lieAbout];
    }

    const ctx = this.deps.narrator.buildContext(state, action, {
      handling: (handling ?? "truth") as any,
      lieText,
      seed,
      topicLabel,
      characterId,
      discoveredEvidenceTitles: state.evidenceIds,
    });
    const outcome = await this.deps.narrator.narrate(ctx);
    // Tag reconstruction replies as testimony/rumor, never canonical Chris.
    const speakerName = speaker === "reconstruction" ? "reconstruction" : characterId ?? "chris";
    return [...result.narration, ...outcome.lines.map((l) => ({ ...l, speaker: speakerName as any }))];
  }
}

function topicToLabel(topic: string): string {
  const map: Record<string, string> = {
    sarge: "Sarge",
    sarge_fine: "whether he and Sarge were really fine",
    money: "the money",
    mother: "your mother",
    note: "the note",
    "the night": "where he was that night",
    marine: "his time in the Marines",
    cats: "Captain the cat",
    general: "the night",
  };
  return map[topic] ?? topic;
}

export function createEngine(deps: EngineDeps): GameEngine {
  return new GameEngine(deps);
}

/** Convenience factory wiring the default providers + Chris artifacts. */
export function createDefaultEngine(inference: InferenceManager): GameEngine {
  const retrieval = buildRetrievalFromMemories(CHRIS.memories);
  const narrator = new Narrator(inference, retrieval);
  return new GameEngine({ retrieval, narrator, inference });
}

// silence unused import warnings for types used only structurally
void FACTS;
void getEvidenceDef;
void CHARACTERS;
void serializeWorldState;
void deserializeWorldState;
