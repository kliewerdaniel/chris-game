import {
  CharacterDef,
  CharacterRuntimeState,
  WorldState,
  FactStatus,
  Belief,
  Goal,
  DisclosureDecision,
  DisclosureMode,
} from "../core/types";
import { CHARACTERS } from "./chris";

/**
 * Threshold below which a guarded character will not disclose sensitive
 * secrets even when pressed. Above it, partial/truth becomes possible.
 */
const TRUST_GATE = 55;

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
      withheld: Array.from(new Set([...def.knowledge.withholds, ...(def.knowledge.secrets ?? [])])),
      beliefs: (def.beliefs ?? []).map((b) => ({ ...b })),
      goals: (def.goalStack ?? def.goals.map((g, i) => ({
        id: `${characterId}.goal.${i}`,
        text: g,
        kind: i === 0 ? "primary" : "secondary",
        weight: 0.8,
        active: true,
      }))),
      askedTopics: {},
      recentlyConfronted: false,
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
   *
   * Back-compat wrapper over the disclosure policy. New callers should use
   * `resolveDisclosure`, which returns the richer decision (mode + seed + why).
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
    const rt = state.characterStates[characterId];

    // Back-compat: historical callers expect lieAbout to be the PLAYER topic
    // (e.g. "sarge_fine"), and the seeded lie wording from def.knowledge.lies,
    // keyed by the canonical-fact form of that topic.
    const canonicalForTopic: Record<string, string> = {
      sarge_fine: "ep1.chris.with_sarge",
      "the night": "ep1.chris.with_sarge",
      sarge: "ep1.chris.with_sarge",
      money: "ep1.chris.owes_money",
      debt: "ep1.chris.owes_money",
    };
    const knownSecrets = rt?.withheld ?? [];
    if (knownSecrets.includes(topicId)) {
      // Raw canonical secret asked directly (e.g. "ep1.chris.with_sarge"),
      // and still withheld at runtime. (If liftWithhold was called, it's gone.)
      const text = (def?.knowledge.lies as Record<string, string> | undefined)?.[topicId];
      return { mode: "withhold", text, lieAbout: topicId };
    }
    const canon = canonicalForTopic[topicId];
    if (canon && rt?.beliefs?.some((b) => b.lieAboutFactId === canon)) {
      const text = (def?.knowledge.lies as Record<string, string> | undefined)?.[topicId];
      return { mode: "lie", text, lieAbout: topicId };
    }
    if (rt?.withheld.includes(topicId) || knownSecrets.includes(topicId)) {
      return { mode: "withhold" };
    }
    if (rt?.knowsFactIds.includes(topicId)) {
      return { mode: "truth" };
    }
    const d = this.resolveDisclosure(state, characterId, topicId, "ask");
    const text = d.seed;
    const lieAbout = d.lieAboutFactId;
    const mode: "truth" | "lie" | "withhold" | "unknown" =
      d.mode === "lie"
        ? "lie"
        : d.mode === "withhold"
        ? "withhold"
        : d.mode === "truth"
        ? "truth"
        : "unknown";
    return { mode, text, lieAbout };
  }

  /**
   * Procedural disclosure policy. The heart of the character simulation:
   * given the character's live belief/goal/trust/emotional state, decide HOW
   * they answer a topic. Deterministic — the LLM only renders the result.
   *
   * Evaluation order (first match wins):
   *   1. emotion — recently confronted on a sensitive topic → threaten/deflect
   *   2. goal conflict — answering endangers an active primary/constraint goal
   *   3. topic secrecy — topic is explicitly withheld
   *   4. belief lie — a player-facing benign-claim topic maps to a seeded false belief
   *   5. trust gate — sensitive topic below TRUST_GATE → withhold (or lie if seeded)
   *   6. unknown — not known and not withheld
   *
   * Note: the raw canonical secret id (e.g. "ep1.chris.with_sarge") is NEVER a
   * lie topic — it routes to withhold. Only the benign-claim topics the player
   * actually says ("sarge_fine", "money", "sarge", "the night", "debt") map to
   * the seeded false beliefs. This is what makes the Ep1 contradiction emergent
   * rather than hardcoded.
   */
  resolveDisclosure(
    state: WorldState,
    characterId: string,
    topic: string,
    actionType: "ask" | "talk" | "confront" = "ask"
  ): DisclosureDecision {
    const def = this.characters[characterId];
    const rt = state.characterStates[characterId];
    if (!def || !rt) {
      return { mode: "unknown", topic, why: "no character/state" };
    }

    const sensitive = rt.withheld;
    const isSensitive = (t: string) =>
      sensitive.includes(t) || rt.withheld.includes(t);

    // 1. EMOTION — recently confronted on a sensitive topic.
    if (rt.recentlyConfronted && isSensitive(topic)) {
      if (rt.trust >= TRUST_GATE) {
        return {
          mode: "deflect",
          topic,
          seed: "Chris shakes his head, quiet. \"We're not doing this right now, kid.\"",
          why: "recently confronted + sensitive + trust>=gate → deflect",
        };
      }
      return {
        mode: "threaten",
        topic,
        seed: "Chris's voice goes flat. \"You push this and we're gonna have a problem. Drop it.\"",
        why: "recently confronted + sensitive + low trust → threaten",
      };
    }

    // 2. GOAL CONFLICT — answering would endanger an active primary/constraint goal.
    const endangered = rt.goals.some(
      (g) => g.active && (g.kind === "primary" || g.kind === "constraint") && g.weight >= 0.6
    );
    if (endangered && isSensitive(topic)) {
      const lieBelief = rt.beliefs.find((b) => b.lieAboutFactId && (b.topics ?? []).includes(topic));
      if (lieBelief?.lieAboutFactId) {
        return {
          mode: "lie",
          topic,
          lieAboutFactId: lieBelief.lieAboutFactId,
          seed: lieBelief.text,
          why: "goal conflict + sensitive + seeded false belief → lie",
        };
      }
      return {
        mode: "withhold",
        topic,
        seed: "Chris goes quiet. \"Some things aren't yours to carry tonight.\"",
        why: "goal conflict + sensitive, no lie seed → withhold",
      };
    }

    // 3. TOPIC SECRECY — explicitly withheld.
    if (rt.withheld.includes(topic)) {
      return {
        mode: "withhold",
        topic,
        seed: "Chris just shakes his head. \"Drop it, kid.\"",
        why: "topic in withheld → withhold",
      };
    }

    // 4. BELIEF LIE — holds a seeded false belief about this (benign-claim) topic.
    const beliefLie = rt.beliefs.find(
      (b) => b.lieAboutFactId && (b.topics ?? []).includes(topic)
    );
    if (beliefLie?.lieAboutFactId) {
      return {
        mode: "lie",
        topic,
        lieAboutFactId: beliefLie.lieAboutFactId,
        seed: beliefLie.text,
        why: "character holds a seeded false belief about topic → lie",
      };
    }

    // 5. TRUST GATE — sensitive topic under the gate.
    if (isSensitive(topic) && rt.trust < TRUST_GATE) {
      const lieBelief = rt.beliefs.find((b) => b.lieAboutFactId && (b.topics ?? []).includes(topic));
      if (lieBelief?.lieAboutFactId) {
        return {
          mode: "lie",
          topic,
          lieAboutFactId: lieBelief.lieAboutFactId,
          seed: lieBelief.text,
          why: "sensitive + trust<gate + lie seed → lie",
        };
      }
      return {
        mode: "withhold",
        topic,
        seed: "Chris's jaw tightens. \"You don't trust me enough to ask that straight. So I won't answer it.\"",
        why: "sensitive + trust<gate, no seed → withhold",
      };
    }

    // KNOWN — not sensitive, character holds the fact.
    if (rt.knowsFactIds.includes(topic)) {
      // Partial if there are still other secrets in play.
      const otherSecrets = sensitive.some((t) => t !== topic && rt.withheld.includes(t) === false);
      if (actionType === "talk" && otherSecrets) {
        return { mode: "partial", topic, seed: "Chris gives you a sliver of the truth, and you can tell there's more he's not saying.", why: "known but other secrets remain → partial" };
      }
      return { mode: "truth", topic, why: "known + not sensitive → truth" };
    }

    // 6. UNKNOWN.
    return { mode: "unknown", topic, why: "not known and not withheld → unknown" };
  }

  /** Record that the player asked a topic; decays recentlyConfronted pressure. */
  recordAsk(state: WorldState, characterId: string, topic: string): WorldState {
    const rt = state.characterStates[characterId];
    if (!rt) return state;
    const askedTopics = {
      ...rt.askedTopics,
      [topic]: (rt.askedTopics[topic] ?? 0) + 1,
    };
    return {
      ...state,
      characterStates: {
        ...state.characterStates,
        [characterId]: {
          ...rt,
          askedTopics,
          // confronting pressure fades once the player shifts to asking
          recentlyConfronted: rt.askedTopics[topic] !== undefined ? rt.recentlyConfronted : false,
        },
      },
    };
  }

  /** Mark that the player just confronted this character. */
  markConfronted(state: WorldState, characterId: string): WorldState {
    const rt = state.characterStates[characterId];
    if (!rt) return state;
    return {
      ...state,
      characterStates: {
        ...state.characterStates,
        [characterId]: { ...rt, recentlyConfronted: true },
      },
    };
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
