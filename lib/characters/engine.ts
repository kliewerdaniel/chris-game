import {
  CharacterDef,
  CharacterRuntimeState,
  WorldState,
  FactStatus,
} from "../core/types";
import { CHARACTERS } from "./chris";

/**
 * Deterministic character engine. All state lives in WorldState.characterStates.
 * The LLM cannot call these functions; only the GameEngine does.
 */
export class CharacterEngine {
  constructor(private characters: Record<string, CharacterDef> = CHARACTERS) {}

  /** Initialize runtime state for a character from its static definition. */
  initState(state: WorldState, characterId: string): WorldState {
    const def = this.characters[characterId];
    if (!def) return state;
    const rt: CharacterRuntimeState = {
      characterId,
      currentLocation: state.location,
      trust: def.baseTrust,
      mood: "neutral",
      knowsFactIds: [...def.knowledge.knows],
      withheld: [...def.knowledge.withholds],
      flags: {},
    };
    return {
      ...state,
      characterStates: { ...state.characterStates, [characterId]: rt },
    };
  }

  getDef(characterId: string): CharacterDef | undefined {
    return this.characters[characterId];
  }

  /** Does the character KNOW a canonical fact? (knowledge boundary) */
  knows(state: WorldState, characterId: string, factId: string): boolean {
    const rt = state.characterStates[characterId];
    const def = this.characters[characterId];
    if (!rt || !def) return false;
    return rt.knowsFactIds.includes(factId);
  }

  /** Does the character NOT know it (explicit boundary)? */
  doesNotKnow(state: WorldState, characterId: string, factId: string): boolean {
    const def = this.characters[characterId];
    if (!def) return false;
    return def.knowledge.doesNotKnow.includes(factId);
  }

  /**
   * Resolve a character's response to a topic.
   * Returns how the character handles it. The narrator turns this into prose;
   * the engine decides the truth value.
   */
  resolveTopic(
    state: WorldState,
    characterId: string,
    topicId: string
  ): {
    mode: "truth" | "lie" | "withhold" | "unknown";
    text?: string;
    lieAbout?: string; // fact id the lie concerns
  } {
    const def = this.characters[characterId];
    if (!def) return { mode: "unknown" };
    const lies = def.knowledge.lies;
    if (lies[topicId]) {
      return { mode: "lie", text: lies[topicId], lieAbout: topicId };
    }
    const rt = state.characterStates[characterId];
    if (rt?.withheld.includes(topicId)) {
      return { mode: "withhold" };
    }
    if (def.knowledge.knows.includes(topicId)) {
      return { mode: "truth" };
    }
    return { mode: "unknown" };
  }

  /** Adjust trust. Clamped 0..100. */
  adjustTrust(
    state: WorldState,
    characterId: string,
    delta: number
  ): WorldState {
    const rt = state.characterStates[characterId];
    if (!rt) return state;
    const trust = Math.max(0, Math.min(100, rt.trust + delta));
    return {
      ...state,
      characterStates: {
        ...state.characterStates,
        [characterId]: { ...rt, trust },
      },
    };
  }

  setMood(state: WorldState, characterId: string, mood: string): WorldState {
    const rt = state.characterStates[characterId];
    if (!rt) return state;
    return {
      ...state,
      characterStates: {
        ...state.characterStates,
        [characterId]: { ...rt, mood },
      },
    };
  }

  /** Grant a character knowledge of a fact (e.g. player tells them something). */
  teach(state: WorldState, characterId: string, factId: string): WorldState {
    const rt = state.characterStates[characterId];
    if (!rt || rt.knowsFactIds.includes(factId)) return state;
    return {
      ...state,
      characterStates: {
        ...state.characterStates,
        [characterId]: {
          ...rt,
          knowsFactIds: [...rt.knowsFactIds, factId],
        },
      },
    };
  }

  /** Remove a withheld topic (character decides to share). */
  liftWithhold(state: WorldState, characterId: string, topicId: string): WorldState {
    const rt = state.characterStates[characterId];
    if (!rt) return state;
    return {
      ...state,
      characterStates: {
        ...state.characterStates,
        [characterId]: {
          ...rt,
          withheld: rt.withheld.filter((t) => t !== topicId),
        },
      },
    };
  }
}

export const characterEngine = new CharacterEngine();
