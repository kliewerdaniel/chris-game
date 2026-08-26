import { WorldState, GameAction, Exchange, DisclosureMode, ActionResult, NarrationLine } from "../core/types";
import { addKnownFact } from "../core/world";
import { getFact } from "../core/facts";
import { characterEngine } from "../characters/engine";
import { topicToLabel } from "./topic-label";
import { resolveTargetTopicFromText } from "../inference/intent";
import { selectSpeaker } from "./world-snapshot";

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
  action: GameAction,
  speaker: string = CHAT_CHARACTER
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
    action.targetId !== "model" &&
    action.targetId !== speaker
  ) {
    return {
      state,
      topicId: "general",
      topicLabel: "the feed",
      decisionMode: "unknown",
    };
  }

  // ADR-005/5D: offline topic enrichment (fail-closed). If the rule parser
  // didn't already bind a topic, try a second deterministic pass over the raw
  // text so "what do you think about the news" maps to `feed` without needing
  // the model. Falls back to `general` (open riff) if nothing matches.
  const topicFromAction = action.topicId;
  const topicFromText = topicFromAction
    ? undefined
    : resolveTargetTopicFromText(action.raw, "chat").topicId;
  const topic = topicFromAction ?? topicFromText ?? "general";
  const topicLabel = topicToLabel(topic);

  const decision = characterEngine.resolveDisclosure(state, speaker, topic, "talk");

  // Record ask pressure + append the player's exchange line.
  let next = characterEngine.recordAsk(state, speaker, topic);
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
  // ADR-006: the speaker is decided deterministically (call→contact, else feed).
  const speaker = selectSpeaker(state, action);
  const resolved = resolveChat(state, action, speaker);
  const decision = characterEngine.resolveDisclosure(resolved.state, speaker, resolved.topicId, "talk");
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
        speaker,
      },
    } as ActionResult,
  };
}

/** Minimal beat helper so this module can emit a player-line without importing episode code. */
function beat(text: string): NarrationLine {
  return { speaker: "player", text };
}

// ---------------------------------------------------------------------------
// ADR-014 — Phase A: deterministic challenge of a reconstruction/testimony claim.
// No model call. Hash-seeded so the same claim always responds the same way
// (reproducible, testable, fail-closed). Missing provenance → concession.
// ---------------------------------------------------------------------------

/** Stable string hash -> [0,1). Same input always yields same output. */
function hashUnit(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Second corpus-sourced line the reconstruction falls back to when doubling down. */
const CORPUS_DOUBLES: string[] = [
  "I'm what Daniel compiled. The Roach and the Cat, the war stories, the jokes he wrote for me — it's all him. You think you're interrogating Chris? You're interrogating Daniel's grief, stitched into a voice.",
  "Every line I give you came out of his notes, his posts, his late-night entries. I don't know if it's him. I know it's what he made. Ask him, not me.",
  "He built me from memory_071 and the WAY OF THE ROACH and the Combat Comedian YAML. That's the whole of me. The real Chris is in the posts he wrote about losing me — not in me.",
];

/**
 * Resolve which claim the player is challenging. The UI passes a factId via
 * `action.targetId` (e.g. "ep4.insane_perfect"); absent that, we fall back to
 * the most recent testimony line in the conversation log, else a generic
 * challenge of the reconstruction itself.
 */
function resolveChallengedClaim(state: WorldState, action: GameAction): {
  factId: string;
  status?: string;
  provenance?: { source: string };
} {
  const byId = action.targetId;
  if (byId) {
    const f = getFact(byId);
    if (f) return { factId: byId, status: f.status, provenance: f.provenance };
  }
  // Walk back through the log for the most recent testimony/reconstruction line.
  const log = state.conversationLog ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const ex = log[i];
    if ((ex.speaker === "chris" || ex.speaker === "reconstruction") && ex.handling) {
      // A testimony line — challenge it generically; we don't store its factId,
      // so treat as reconstruction-voice challenge (concedes or doubles).
      return { factId: "reconstruction.voice", provenance: { source: "The reconstruction (in-voice)" } };
    }
  }
  return { factId: "reconstruction.voice", provenance: { source: "The reconstruction (in-voice)" } };
}

/**
 * Deterministic challenge handler. Returns the same `{state, result}` shape as
 * doChat. Records `epN.challenged.<factId>` into the ledger so the player's
 * skepticism is part of the record, never discarded.
 */
export function doChallenge(
  state: WorldState,
  action: GameAction
): { state: WorldState; result: ActionResult } {
  const claim = resolveChallengedClaim(state, action);
  const speaker = "chris";

  // Record the challenge as an established event (ledger-tracked).
  const challengeFact = `challenge.${claim.factId}`;
  let next = addKnownFact(state, challengeFact);

  // Fail-closed: if the claim has no provenance/on-screen source, the
  // reconstruction concedes — it never asserts a world-truth under pressure.
  const hasSource = !!claim.provenance?.source;
  const seed = hashUnit(claim.factId + "|" + (claim.provenance?.source ?? ""));
  const doublesDown = hasSource && seed > 0.5;

  let line: NarrationLine;
  if (!hasSource) {
    line = {
      speaker,
      text: "I don't have a source for that one. I'm just what Daniel compiled — I don't know if any of it's him. Push me and I'll just be louder, not truer.",
      status: "testimony",
      handling: "unknown",
    };
  } else if (doublesDown) {
    const idx = Math.floor(seed * CORPUS_DOUBLES.length) % CORPUS_DOUBLES.length;
    line = {
      speaker,
      text: CORPUS_DOUBLES[idx],
      status: "testimony",
      handling: "deflect",
    };
  } else {
    line = {
      speaker,
      text: "You're right to push. I'm just what Daniel compiled — a voice stitched from his notes, his posts, the Roach and the Cat. I don't know if any of it's the real Chris. I just say it back in his cadence.",
      status: "testimony",
      handling: "unknown",
    };
  }

  return {
    state: next,
    result: {
      ok: true,
      narration: [
        { speaker: "player", text: `> you challenge: ${claim.factId}` },
        line,
      ],
      events: [],
      establishedFacts: [challengeFact],
    } as ActionResult,
  };
}

