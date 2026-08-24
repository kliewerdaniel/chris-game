/**
 * LLM INTENT RESOLVER (ADR-002).
 *
 * The LLM is used as a LANGUAGE resolver, NOT an executor. It maps a player's
 * free-text utterance to a single closed-schema `GameAction` via native
 * tool-calling. Two findings from the live spike (ornith.gguf @ :8080,
 * 2026-08-24) shape this module:
 *
 *  1. The model is a STRONG verb resolver but a WEAK closed-id resolver — it
 *     frequently drops `targetId`/`topicId` or mis-cases ids ("Chris" vs
 *     "chris"). So we use it for the verb, then RE-DERIVE the ids with the
 *     deterministic rule matchers (`resolveTargetTopicFromText`) and constrain
 *     everything to the episode's allowed enums.
 *  2. JSON-mode fallback is unreliable (the model ignores the schema). So the
 *     ONLY fallback is `parseAction` (rules), never JSON parsing.
 *
 * The returned action is NOT trusted. `GameEngine.processTurn` re-validates it
 * against `ep.dispatch` exactly like a rule output. The model never sees world
 * state, facts, secrets, or trust — only the raw text and the closed action
 * schema. It cannot invent a "truth".
 */

import { GameAction, IntentVerb } from "../core/types";
import { InferenceManager, ChatTool, ChatToolCall } from "./provider";
import { resolveTargetTopicFromText } from "./intent";

/** The closed id-space an episode exposes to the player right now. */
export interface AllowedActions {
  /** verbs the active episode can handle. */
  verbs: IntentVerb[];
  /** target ids reachable right now (contacts + evidence + characters + items). */
  targetIds: string[];
  /** topic ids the disclosure engine knows (lowercased). */
  topicIds: string[];
}

export const ALL_VERBS: IntentVerb[] = [
  "look",
  "talk",
  "ask",
  "examine",
  "search",
  "move",
  "use",
  "call",
  "confront",
  "sleep",
  "wait",
  "tell",
  "inventory",
  "evidence",
  "help",
];

/** Build the single-function tool schema, constrained to `allowed`. */
export function buildActionSchema(allowed: AllowedActions): ChatTool {
  const verbs = allowed.verbs.length ? allowed.verbs : ALL_VERBS;
  return {
    type: "function",
    function: {
      name: "resolve_player_action",
      description:
        "Map the player's free-text utterance in the text adventure CHRIS to a single game action. Choose the verb; target/topic are optional and will be matched from the world.",
      parameters: {
        type: "object",
        properties: {
          verb: { type: "string", enum: verbs as string[] },
          targetId: allowed.targetIds.length
            ? { type: ["string", "null"], enum: [...allowed.targetIds, null] }
            : { type: ["string", "null"], enum: [null] },
          topicId: allowed.topicIds.length
            ? { type: ["string", "null"], enum: [...allowed.topicIds, null] }
            : { type: ["string", "null"], enum: [null] },
          raw: { type: "string", description: "The exact player text, unchanged." },
        },
        required: ["verb", "raw"],
        additionalProperties: false,
      },
    },
  };
}

function normalizeId(id: unknown): string | undefined {
  if (typeof id !== "string") return undefined;
  const s = id.trim().toLowerCase();
  return s.length ? s : undefined;
}

function parseToolArguments(tc: ChatToolCall): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(tc.arguments) as Record<string, unknown>;
    if (obj && typeof obj === "object") return obj;
  } catch {
    /* malformed JSON → caller treats as no-tool */
  }
  return null;
}

/**
 * Resolve a player utterance through the LLM. Returns null on ANY failure
 * (no tool call, bad verb, model down) so the caller falls back to rules.
 */
export async function resolveIntentWithLLM(
  raw: string,
  inference: InferenceManager,
  allowed: AllowedActions
): Promise<GameAction | null> {
  const schema = buildActionSchema(allowed);
  let result;
  try {
    result = await inference.chat({
      messages: [
        {
          role: "system",
          content:
            "You are the input parser for a text adventure. Call the resolve_player_action tool with the player's intent. Use only the provided enum values. Always include the raw text verbatim.",
        },
        { role: "user", content: raw },
      ],
      temperature: 0.2,
      maxTokens: 300,
      tools: [schema],
      toolChoice: "auto",
    });
  } catch {
    return null; // model down → rules
  }

  const tc = result.toolCalls?.[0];
  if (!tc || tc.name !== "resolve_player_action") return null;
  const args = parseToolArguments(tc);
  if (!args) return null;

  const verb = normalizeId(args.verb) as IntentVerb | undefined;
  if (!verb || !allowed.verbs.includes(verb as IntentVerb)) return null;

  // The model is a weak id resolver — prefer the RULE-DERIVED id (deterministic
  // and world-aware) over the model's value, and only accept the model's id
  // when it is a valid allowed id AND the rule pass is silent. The rule pass is
  // verb-aware (suppresses character names for object verbs) so a name embedded
  // in an object description (e.g. "examine the letter Chris left") doesn't
  // hijack the target.
  const rule = resolveTargetTopicFromText(raw, verb);
  const modelTarget = normalizeId(args.targetId);
  const modelTopic = normalizeId(args.topicId);

  const targetId =
    rule.targetId ?? (modelTarget && allowed.targetIds.includes(modelTarget) ? modelTarget : undefined);
  const topicId =
    rule.topicId ?? (modelTopic && allowed.topicIds.includes(modelTopic) ? modelTopic : undefined);

  return {
    intent: { verb, target: targetId, topic: topicId },
    type: verb,
    targetId: targetId || undefined,
    topicId: topicId || undefined,
    raw,
  };
}
