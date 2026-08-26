import { WorldState, GameAction, ActionResult, NarrationLine, DisclosureMode } from "../core/types";
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
import { LocalInferenceBackend, createClientBackend } from "../inference/narrate-backend";
import { recordModelLine, recentExchangesFor, pushRecentlySaid, isBoundaryMode, doChat } from "./dialogue";
import { resolveSnapshot, selectSpeaker } from "./world-snapshot";
import { parseAction, isConfident, RESOLVABLE_TARGET_IDS, RESOLVABLE_TOPIC_IDS } from "../inference/intent";
import { resolveIntentWithLLM, AllowedActions, ALL_VERBS } from "../inference/llm-intent";
import { Episode, EpisodeContext } from "../core/episode";
import { EPISODE1 } from "./episode1";
import { EPISODE2 } from "./episode2";
import { EPISODE3 } from "./episode3";
import { EPISODE4 } from "./episode4";
import { applyWorldEvents } from "./world-events";
import { buildInvestigationPayload } from "../core/investigation";
import { doReconstruct } from "./reconstruct";

export const EPISODES: Record<string, Episode> = {
  ep1: EPISODE1,
  ep2: EPISODE2,
  ep3: EPISODE3,
  ep4: EPISODE4,
};

export interface EngineDeps {
  retrieval: Retrieval;
  narrator: Narrator;
  /** null on the public client path — narration is handled by a serverless fn. */
  inference: InferenceManager | null;
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

    // M2 — player reconstruction-graph actions are engine-level, game-wide
    // verbs. Route them before episode dispatch; they mutate only the player's
    // own graph layer and never touch canonical facts.
    if (["hypothesize", "connect", "test"].includes(action.type)) {
      const rec = doReconstruct(state, action);
      if (rec) {
        const worldStep = applyWorldEvents(rec.state);
        return { state: worldStep.state, result: rec.result, action };
      }
    }

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

    // ADR-006: UNIVERSAL CHAT INTERFACE. There is no "didn't catch that" wall.
    // If the parser isn't confident (free prose, typos, nonsense) the input is
    // coerced to a `chat` turn with the reconstruction as speaker, so the
    // player ALWAYS gets a reply — and it is part of the same world.
    if (!isConfident(action)) {
      action = { ...action, type: "chat", targetId: undefined, topicId: undefined };
    }

    const ctx: EpisodeContext = { engine: this.engineApi(), ce: this.ce };
    const handler = ep.dispatch(action, ctx);

    // No episode handler for this verb (e.g. a "call" before the phone is
    // unlocked, or a malformed world action) → it still becomes a chat turn so
    // the feed responds within the world, never a dead wall.
    if (!handler) {
      if (action.type !== "chat") {
        action = { ...action, type: "chat", targetId: undefined, topicId: undefined };
      }
    }

    const resolvedHandler = handler ?? ((s: WorldState, a: GameAction) => doChat(s, a));
    let { state: next, result } = await resolvedHandler(state, action, ctx);

    // ADR-006: even a failed action (phone locked, nothing to do) becomes a
    // feed/chat reply so the player NEVER hits a dead wall — every input is
    // answered within the same world.
    if (!result.ok) {
      const chatAction: GameAction = { ...action, type: "chat", targetId: undefined, topicId: undefined };
      const chatResolved = doChat(next, chatAction);
      next = chatResolved.state;
      result = chatResolved.result;
    }

    // Apply deterministic scheduled world events against the post-action state.
    // Fired ids are idempotent (recorded in next.firedEventIds). These carry
    // seeded, canonical narration — the model never authors world happenings.
    const worldStep = applyWorldEvents(next);
    next = worldStep.state;

    // ADR-006: voice character turns, INCLUDING a world-aware feed reaction
    // after every world action (look/examine/move/use/search). The world
    // always talks back. Safety-net: voice empty narration too.
    if (result.ok) {
      const characterTurn = ["talk", "ask", "confront", "chat", "call"].includes(action.type);
      const worldReaction = ["look", "examine", "move", "use", "search", "read"].includes(action.type);
      const needsVoice = characterTurn || worldReaction || result.narration.length === 0;
      if (needsVoice) {
        const { lines, state: voiced } = await this.generateNarration(next, action, result);
        next = voiced;
        result = { ...result, narration: lines };
      }
    }

    return { state: next, result: this.withSuggestion(result, next), action };
  }

  /**
   * ADR-014 §5.2 auto-prompt — derive the proactive next-step suggestion from
   * the post-turn board and attach it to the result. Deterministic, derived
   * from existing WorldState (buildInvestigationPayload), no model call, no
   * world-truth assertion. The UI surfaces it as a nudge; it is the same field
   * the Consistency Board already renders.
   */
  private withSuggestion(
    result: ActionResult,
    state: WorldState
  ): ActionResult {
    return { ...result, suggestedNext: buildInvestigationPayload(state).suggestedNext };
  }

  /**
   * ADR-011: process a turn from an ALREADY-RESOLVED action. The public client
   * path routes ambiguous input to a serverless intent resolver; the returned
   * GameAction is applied here through the SAME deterministic pipeline
   * (validate → dispatch → voice → narration). The action is never trusted to
   * mutate state — ep.dispatch gating + the rule fallback below stay authoritative.
   */
  async processTurnWithAction(
    state: WorldState,
    action: GameAction
  ): Promise<{ state: WorldState; result: ActionResult; action: GameAction }> {
    const ep = this.getEpisode(state);

    // M2 — player reconstruction-graph actions are engine-level, game-wide
    // verbs. Route them before episode dispatch / chat-coercion; they mutate
    // only the player's own graph layer and never touch canonical facts.
    if (["hypothesize", "connect", "test"].includes(action.type)) {
      const rec = doReconstruct(state, action);
      if (rec) {
        const worldStep = applyWorldEvents(rec.state);
        return { state: worldStep.state, result: rec.result, action };
      }
    }

    // Universal chat coercion for unconfident/empty actions (ADR-006).
    if (!isConfident(action)) {
      action = { ...action, type: "chat", targetId: undefined, topicId: undefined };
    }

    const ctx: EpisodeContext = { engine: this.engineApi(), ce: this.ce };
    const handler = ep.dispatch(action, ctx);

    if (!handler) {
      if (action.type !== "chat") {
        action = { ...action, type: "chat", targetId: undefined, topicId: undefined };
      }
    }

    const resolvedHandler = handler ?? ((s: WorldState, a: GameAction) => doChat(s, a));
    let { state: next, result } = await resolvedHandler(state, action, ctx);

    if (!result.ok) {
      const chatAction: GameAction = { ...action, type: "chat", targetId: undefined, topicId: undefined };
      const chatResolved = doChat(next, chatAction);
      next = chatResolved.state;
      result = chatResolved.result;
    }

    const worldStep = applyWorldEvents(next);
    next = worldStep.state;

    if (result.ok) {
      const characterTurn = ["talk", "ask", "confront", "chat", "call"].includes(action.type);
      const worldReaction = ["look", "examine", "move", "use", "search", "read"].includes(action.type);
      const needsVoice = characterTurn || worldReaction || result.narration.length === 0;
      if (needsVoice) {
        const { lines, state: voiced } = await this.generateNarration(next, action, result);
        next = voiced;
        result = { ...result, narration: lines };
      }
    }

    return { state: next, result: this.withSuggestion(result, next), action };
  }

  private engineApi() {
    return {
      buildNarration: async (
        state: WorldState,
        action: GameAction,
        result: ActionResult
      ): Promise<NarrationLine[]> => (await this.generateNarration(state, action, result)).lines,
    };
  }

  /** After a handler, generate model narration for character turns. */
  private async generateNarration(
    state: WorldState,
    action: GameAction,
    result: ActionResult
  ): Promise<{ lines: NarrationLine[]; state: WorldState }> {
    const handling = (result.stateChanges as any)?.handling as DisclosureMode | undefined;
    const lieAbout = (result.stateChanges as any)?.lieAbout as string | undefined;
    const speaker = (result.stateChanges as any)?.speaker as string | undefined;
    const seed = (result.stateChanges as any)?.seed as string | undefined;
    const topicLabel = (result as any).topicLabel as string | undefined;

    // ADR-006: speaker is decided deterministically. An explicit `call` to a
    // known contact routes to that person; everything else is the feed
    // (the reconstruction). This is the "whether it be chris or the feed" rule.
    const speakerId = selectSpeaker(state, action);

    // Character turns (talk/ask/confront/chat/call) are voiced by the speaker.
    // World actions (look/examine/move/use/search/sleep/...) ALSO get a feed
    // reaction so the world always talks back (ADR-006). For those we ground a
    // free-riff reply in the live WorldSnapshot as the reconstruction/feed.
    const isCharacterTurn = ["talk", "ask", "confront", "chat", "call"].includes(action.type);

    // Determine which character voices this turn.
    let characterId: string | undefined;
    if (isCharacterTurn) {
      if (speakerId === "chris" || action.targetId === "chris" || action.targetId === "reconstruction" || action.targetId === "model") {
        characterId = "chris";
      } else if (action.type === "confront") {
        characterId = "chris";
      } else {
        characterId = speakerId;
      }
    } else {
      // World action → the feed/reconstruction reacts to the world.
      characterId = "chris";
    }

    let lieText: string | undefined;
    if (handling === "lie" && lieAbout && CHRIS.knowledge.lies[lieAbout]) {
      lieText = CHRIS.knowledge.lies[lieAbout];
    }

    const ctx = this.deps.narrator.buildContext(state, action, {
      handling: (handling ?? "unknown") as any,
      lieText,
      seed,
      topicLabel,
      characterId,
      discoveredEvidenceTitles: state.evidenceIds,
      // ADR-005: chat turns read the rolling exchange window + uniqueness ring.
      recentExchanges: action.type === "chat" ? recentExchangesFor(state) : undefined,
      freeRiff: !isCharacterTurn ? true : !isBoundaryMode(handling),
      recentlySaid: action.type === "chat" ? state.characterStates[speakerId]?.recentlySaid ?? [] : undefined,
      // ADR-006: ground the reply in the live world so Chris/the feed can
      // reference where you are and what you've found.
      worldSnapshot: resolveSnapshot(state),
    });
    const outcome = await this.deps.narrator.narrate(ctx);
    // ADR-005/006: persist the model's line into the rolling log + uniqueness
    // ring so the next riff turn has continuity. State side-effect only (no facts).
    const modelText = outcome.lines.map((l) => l.text).join(" ");
    let nextState = state;
    if (modelText) {
      nextState = recordModelLine(nextState, { text: modelText, speaker: isCharacterTurn ? speakerId : "chris", handling });
      nextState = pushRecentlySaid(nextState, "chris", modelText);
    }
    // Tag reconstruction replies as testimony/rumor, never canonical Chris.
    const speakerName = (isCharacterTurn ? speaker : "chris") === "reconstruction" ? "reconstruction" : characterId ?? "chris";
    // ADR-UI: surface the engine's disclosure decision as a SUBTLE, in-fiction
    // cue only. Truthful modes (truth/partial/unknown/joke) carry no marker —
    // the player should not see a "lie" tag, only feel the evasion through the
    // prose the engine already authored. The decision is deterministic engine
    // state, never model-set.
    const showHandling =
      isCharacterTurn && handling && handling !== "truth" && handling !== "partial" && handling !== "unknown" && handling !== "joke";
    return {
      lines: [
        ...result.narration,
        ...outcome.lines.map((l) => ({
          ...l,
          speaker: speakerName as any,
          ...(showHandling ? { handling } : {}),
        })),
      ],
      state: nextState,
    };
  }
}

function topicToLabel(topic: string): string {
  const map: Record<string, string> = {
    is_chris: "whether it's really Chris",
    voice: "whether it's really his voice",
    memory: "whether it really remembers",
    feed: "the feed",
    act: "the act / KonradFreeman",
    misinfo: "the misinformation it makes",
    toll: "what it's doing to you",
    cats: "Captain the cat",
    mother: "your mother",
    note: "the post",
    general: "the feed",
  };
  return map[topic] ?? topic;
}

export function createEngine(deps: EngineDeps): GameEngine {
  return new GameEngine(deps);
}

/** Convenience factory wiring the default providers + Chris artifacts. */
export function createDefaultEngine(inference: InferenceManager): GameEngine {
  const retrieval = buildRetrievalFromMemories(CHRIS.memories);
  const narrator = new Narrator(
    new LocalInferenceBackend((req) =>
      inference.chat({
        messages: [
          { role: "system", content: req.systemInstruction },
          { role: "user", content: req.userPrompt },
        ],
        temperature: req.temperature,
        maxTokens: req.maxTokens,
      })
    ),
    retrieval
  );
  return new GameEngine({ retrieval, narrator, inference });
}

/**
 * Build an engine that runs entirely CLIENT-SIDE for public play. The narrator
 * uses the browser's `HostedNarrateBackend` (POSTs to same-origin `/api/narrate`)
 * or falls back to the deterministic backend when narration is disabled. No
 * `InferenceManager` is constructed in the browser, so no model key or localhost
 * probe ever ships to the client.
 */
export function createClientEngine(): GameEngine {
  const retrieval = buildRetrievalFromMemories(CHRIS.memories);
  const narrator = new Narrator(createClientBackend(), retrieval);
  return new GameEngine({ retrieval, narrator, inference: null });
}

// silence unused import warnings for types used only structurally
void FACTS;
void getEvidenceDef;
void CHARACTERS;
void serializeWorldState;
void deserializeWorldState;
