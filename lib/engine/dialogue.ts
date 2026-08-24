import { WorldState, GameAction, Exchange, DisclosureMode, ActionResult, NarrationLine } from "../core/types";
import { characterEngine } from "../characters/engine";
import { topicToLabel } from "./topic-label";

/**
 * ADR-005 — shared conversational riff resolver.
 *
 * Single source of truth for the `chat` verb across all four episodes. Every
 * episode's `case "chat":` routes here so the disclosure decision + the
 * conversation-log bookkeeping are identical everywhere (indistinguishability).
 *
 * IMPORTANT: this module is PURE and makes NO model call. It only (1) decides
 * the disclosure handling via the deterministic CharacterEngine (the epistemic
 * boundary stays rule-only), and (2) appends the transcript exchange. The
 * actual riff prose is produced later by Narrator.narrate, which reads
 * `recentExchangesFor` from the log this module writes.
 */

const RECENT_WINDOW = 6;
const RECENTLY_SAID_CAP = 4;

/** Speaker id for the reconstruction's voice (always 'chris' in this build). */
const CHAT_CHARACTER = "chris";

/**
 * The disclosure topics that are "boundary" turns — the reconstruction must NOT
 * riff freely here; it stays seed-locked so the emotional core (the lie that it
 * is Chris, etc.) never drifts under model variation. Open turns (truth /
 * unknown / narration) are where the riff loop lives.
 */
export const BOUNDARY_MODES: DisclosureMode[] = [
  "lie",
  "withhold",
  "deflect",
  "threaten",
  "partial",
];

export function isBoundaryMode(mode: DisclosureMode | undefined): boolean {
  return !!mode && BOUNDARY_MODES.includes(mode);
}

/**
 * Resolve a free-form `chat` turn. Returns the (possibly) mutated state plus
 * the rule-decided disclosure decision, WITHOUT calling the model.
 *
 * - The reconstruction is the only speaker in-room for chat (mirrors talk/ask).
 * - If a topic was resolved (by rules or the LLM extractor upstream), it drives
 *   the disclosure decision; otherwise `general` → open riff.
 * - Records the player's line into the conversation log immediately, so the
 *   transcript is continuous even if the model later fails (fail-closed).
 */
export function resolveChat(
  state: WorldState,
  action: GameAction
): {
  state: WorldState;
  topicId: string;
  topicLabel: string;
  decisionMode: DisclosureMode;
  seed?: string;
  lieAboutFactId?: string;
} {
  // No one to talk to but the feed (mirrors doAsk guard).
  if (
    action.targetId &&
    action.targetId !== "chris" &&
    action.targetId !== "reconstruction" &&
    action.targetId !== "feed" &&
    action.targetId !== "model"
  ) {
    return {
      state,
      topicId: "general",
      topicLabel: "the feed",
      decisionMode: "unknown",
    };
  }

  const topic = action.topicId ?? "general";
  const topicLabel = topicToLabel(topic);

  const decision = characterEngine.resolveDisclosure(state, CHAT_CHARACTER, topic, "talk");

  // Record ask pressure + append the player's exchange line.
  let next = characterEngine.recordAsk(state, CHAT_CHARACTER, topic);
  next = appendExchange(next, {
    turn: next.conversationLog.length + 1,
    speaker: "player",
    verb: "chat",
    topicId: topic,
    text: action.raw,
    ts: { ...next.time },
  });

  return {
    state: next,
    topicId: topic,
    topicLabel,
    decisionMode: decision.mode,
    seed: decision.seed,
    lieAboutFactId: decision.lieAboutFactId,
  };
}

/** Append a model/narrator line after narration resolves. */
export function recordModelLine(
  state: WorldState,
  opts: { text: string; speaker?: Exchange["speaker"]; handling?: DisclosureMode; topicId?: string }
): WorldState {
  return appendExchange(state, {
    turn: state.conversationLog.length + 1,
    speaker: opts.speaker ?? CHAT_CHARACTER,
    handling: opts.handling,
    topicId: opts.topicId,
    text: opts.text,
    ts: { ...state.time },
  });
}

/** Rolling window of the last N exchanges, oldest→newest. */
export function recentExchangesFor(state: WorldState, n = RECENT_WINDOW): Exchange[] {
  const log = state.conversationLog ?? [];
  return log.slice(Math.max(0, log.length - n));
}

/** Update the per-character recentlySaid ring (used by the uniqueness guard). */
export function pushRecentlySaid(state: WorldState, characterId: string, text: string): WorldState {
  const rt = state.characterStates[characterId];
  if (!rt) return state;
  const ring = [...(rt.recentlySaid ?? []), text].slice(-RECENTLY_SAID_CAP);
  return {
    ...state,
    characterStates: {
      ...state.characterStates,
      [characterId]: { ...rt, recentlySaid: ring },
    },
  };
}

function appendExchange(state: WorldState, ex: Exchange): WorldState {
  const log = state.conversationLog ?? [];
  return {
    ...state,
    conversationLog: [...log, ex],
  };
}

/**
 * Episode-facing `chat` handler. Returns the same `{state, result}` shape as
 * doTalk/doAsk so episodes can route `case "chat":` straight to it. The model
 * voicing happens downstream via the engine's existing generateNarration path
 * (it reads `result.stateChanges.handling`), which ADR-005 phase 5C upgrades to
 * inject the conversation window. The disclosure decision here is rule-only.
 */
export function doChat(
  state: WorldState,
  action: GameAction
): { state: WorldState; result: ActionResult } {
  const resolved = resolveChat(state, action);
  const decision = characterEngine.resolveDisclosure(resolved.state, CHAT_CHARACTER, resolved.topicId, "talk");
  const next = resolved.state;
  return {
    state: next,
    result: {
      ok: true,
      narration: [beat(`You say to the feed: "${action.raw}"`)],
      events: [],
      topicLabel: resolved.topicLabel,
      stateChanges: {
        handling: decision.mode,
        lieAbout: decision.lieAboutFactId,
        seed: decision.seed,
        why: decision.why,
        speaker: CHAT_CHARACTER,
      },
    } as ActionResult,
  };
}

/** Minimal beat helper so this module can emit a player-line without importing episode code. */
function beat(text: string): NarrationLine {
  return { speaker: "player", text };
}
