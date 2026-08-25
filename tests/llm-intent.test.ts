import { describe, it, expect } from "vitest";
import { MockProvider, InferenceManager } from "../lib/inference/provider";
import { resolveIntentWithLLM, buildActionSchema, AllowedActions } from "../lib/inference/llm-intent";
import { resolveTargetTopicFromText, RESOLVABLE_TARGET_IDS } from "../lib/inference/intent";
import { GameEngine } from "../lib/engine/game-engine";
import { buildRetrievalFromMemories } from "../lib/retrieval/retrieval";
import { CHRIS } from "../lib/characters/chris";

const ALLOWED: AllowedActions = {
  verbs: ["look", "talk", "ask", "examine", "call", "sleep", "confront", "move"],
  targetIds: ["chris", "mother", "phone", "note"],
  topicIds: ["is_chris", "voice", "memory", "feed", "mother"],
};

function toolEngine(toolArgs: unknown | null, name = "resolve_player_action") {
  const inference = new InferenceManager([
    new MockProvider(undefined, (req) =>
      toolArgs === null
        ? null
        : [{ name, arguments: JSON.stringify(toolArgs) }]
    ),
  ]);
  return inference;
}

function silentNarrator(): any {
  return {
    buildContext: () => ({}) as any,
    narrate: async () => ({ lines: [{ speaker: "narrator", text: "[mock]" }], usedModel: false, simulated: true }),
  };
}

describe("llm-intent resolver (hermetic)", () => {
  it("builds a schema constrained to the allowed id-space", () => {
    const schema = buildActionSchema(ALLOWED);
    const props = schema.function.parameters.properties as any;
    expect(schema.function.name).toBe("resolve_player_action");
    expect((props.verb.enum as string[])).toEqual(ALLOWED.verbs);
    expect((props.targetId.enum as string[]).filter((v) => v !== null)).toEqual(ALLOWED.targetIds);
    expect((props.topicId.enum as string[]).filter((v) => v !== null)).toEqual(ALLOWED.topicIds);
  });

  it("resolves a verb from the model and keeps a valid model target", async () => {
    const inf = toolEngine({ verb: "talk", targetId: "chris", topicId: "is_chris", raw: "talk to the feed about whether it's really Chris" });
    const a = await resolveIntentWithLLM("talk to the feed about whether it's really Chris", inf, ALLOWED);
    expect(a).not.toBeNull();
    expect(a!.type).toBe("talk");
    expect(a!.targetId).toBe("chris");
    expect(a!.topicId).toBe("is_chris");
  });

  it("repairs a DROPPED target via the rule pass (spike finding)", async () => {
    // Model emitted verb+raw but no targetId — exactly the 'call mother' spike
    // failure. The rule pass must recover 'mother'.
    const inf = toolEngine({ verb: "call", raw: "call mother on the phone" });
    const a = await resolveIntentWithLLM("call mother on the phone", inf, ALLOWED);
    expect(a).not.toBeNull();
    expect(a!.type).toBe("call");
    expect(a!.targetId).toBe("mother"); // recovered by resolveTargetTopicFromText
  });

  it("repairs a mis-cased id (spike finding: 'Chris' -> 'chris')", async () => {
    const inf = toolEngine({ verb: "talk", targetId: "Chris", raw: "talk to Chris" });
    const a = await resolveIntentWithLLM("talk to Chris", inf, ALLOWED);
    expect(a!.targetId).toBe("chris");
  });

  it("rejects a verb outside the allowed set -> falls back to rules (null)", async () => {
    const inf = toolEngine({ verb: "fly", raw: "fly away" });
    const a = await resolveIntentWithLLM("fly away", inf, ALLOWED);
    expect(a).toBeNull();
  });

  it("falls back (null) when the model emits no tool call", async () => {
    const inf = toolEngine(null);
    const a = await resolveIntentWithLLM("anything", inf, ALLOWED);
    expect(a).toBeNull();
  });

  it("falls back (null) when the model throws (model down -> rules)", async () => {
    const dying = new InferenceManager([
      { name: "boom", local: true, async chat() { throw new Error("down"); } } as any,
    ]);
    const a = await resolveIntentWithLLM("anything", dying, ALLOWED);
    expect(a).toBeNull();
  });

  it("resolveTargetTopicFromText matches the rule matcher universe", () => {
    const r = resolveTargetTopicFromText("call mother on the phone");
    expect(r.targetId).toBe("mother");
    expect(RESOLVABLE_TARGET_IDS).toContain("mother");
  });
});

describe("GameEngine — LLM parse opt-in (CHRIS_USE_LLM_PARSE)", () => {
  function llmEngine(toolArgs: unknown | null) {
    const inference = new InferenceManager([
      new MockProvider(undefined, (req) =>
        toolArgs === null ? null : [{ name: "resolve_player_action", arguments: JSON.stringify(toolArgs) }]
      ),
    ]);
    const retrieval = buildRetrievalFromMemories(CHRIS.memories);
    return new GameEngine({ retrieval, narrator: silentNarrator(), inference });
  }

  it("respects rules-only default (no opt-in) even though a model is present", async () => {
    const prev = process.env.CHRIS_USE_LLM_PARSE;
    delete process.env.CHRIS_USE_LLM_PARSE;
    const eng = llmEngine({ verb: "sleep", raw: "let's get some sleep" });
    const s = eng.newGame();
    const { result } = await eng.processTurn(s, "let's get some sleep");
    // Rule path handles it; the model toolArgs are simply never consulted.
    expect(result.ok).toBe(true);
    process.env.CHRIS_USE_LLM_PARSE = prev!;
  });

  it("uses the LLM action when opted in and the episode can handle the verb", async () => {
    const prev = process.env.CHRIS_USE_LLM_PARSE;
    process.env.CHRIS_USE_LLM_PARSE = "1";
    // 'call mother on the phone' — model drops targetId; rule pass recovers it.
    const eng = llmEngine({ verb: "call", raw: "call mother on the phone" });
    const s0 = eng.newGame();
    // phone must be unlocked for the call to be testable here; seed it.
    const s = { ...s0, phoneUnlocked: true };
    const { result } = await eng.processTurn(s, "call mother on the phone");
    expect(result.ok).toBe(true);
    process.env.CHRIS_USE_LLM_PARSE = prev!;
  });

  it("falls back to rules when the LLM returns an unhandleable verb (no crash, world still answers)", async () => {
    const prev = process.env.CHRIS_USE_LLM_PARSE;
    process.env.CHRIS_USE_LLM_PARSE = "1";
    const eng = llmEngine({ verb: "fly", raw: "fly away" }); // null from resolver
    const s = eng.newGame();
    // 'fly' is unhandleable -> coerced to a feed/chat reply (ADR-006: never a
    // dead wall). The engine does NOT crash and does NOT invent a fly action.
    const { result, action } = await eng.processTurn(s, "fly away");
    expect(result.ok).toBe(true);
    expect(result.narration.length).toBeGreaterThan(0);
    expect(action.type).toBe("chat");
    process.env.CHRIS_USE_LLM_PARSE = prev!;
  });
});

// ── ADR-011: public-path intent resolver contract ─────────────────────────────
// These assert the shape that the new serverless /api/intent depends on, after
// HostedProvider was fixed to forward tool_calls (it dropped them before).
describe("llm intent resolver — ADR-011 public contract", () => {
  it("rule pass wins over the model's target id ('examine the post' -> note)", async () => {
    const inference = new InferenceManager([
      new MockProvider(undefined, () => [
        { name: "resolve_player_action", arguments: JSON.stringify({ verb: "examine", targetId: "post", raw: "examine the post" }) },
      ]),
    ]);
    const action = await resolveIntentWithLLM("examine the post", inference, {
      verbs: ALLOWED.verbs,
      targetIds: [...ALLOWED.targetIds, ...RESOLVABLE_TARGET_IDS],
      topicIds: ALLOWED.topicIds,
    });
    expect(action).not.toBeNull();
    expect(action!.type).toBe("examine");
    // Deterministic rule resolution maps "post" -> canonical `note` topic target.
    expect(action!.targetId).toBe("note");
    expect(action!.raw).toBe("examine the post");
  });

  it("returns null when the model emits no tool call (client falls back to rules)", async () => {
    const inference = new InferenceManager([
      new MockProvider((req) => `Sure! ${req.messages[1]?.content}`),
    ]);
    const action = await resolveIntentWithLLM("hello chris", inference, {
      verbs: ALLOWED.verbs,
      targetIds: ALLOWED.targetIds,
      topicIds: ALLOWED.topicIds,
    });
    expect(action).toBeNull();
  });
});
