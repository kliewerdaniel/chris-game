import { describe, it, expect } from "vitest";
import { Narrator } from "../lib/narrative/narrator";
import type { NarrationContext } from "../lib/narrative/narrator";
import { LocalInferenceBackend } from "../lib/inference/narrate-backend";
import { Retrieval } from "../lib/retrieval/retrieval";
import type { GameAction } from "../lib/core/types";

/**
 * EPISTEMIC BOUNDARY REGRESSION (M1 — wake the status palette on model lines).
 * The model only RENDERS the engine's already-decided disclosure; it never
 * authors world-canon. So a line the reconstruction itself speaks must be
 * stamped TESTIMONY, not CANONICAL. CANONICAL is reserved for the deterministic
 * world's own ground truth (facts, evidence, engine-authored narration).
 */

function makeNarrator(): Narrator {
  const backend = new LocalInferenceBackend(
    async () => ({ text: "Chris says something in his voice.", simulated: false })
  );
  return new Narrator(backend, new Retrieval([]));
}

function characterCtx(overrides: Partial<NarrationContext> = {}): NarrationContext {
  return {
    action: { type: "talk", raw: "talk to chris", intent: { verb: "talk" } } as GameAction,
    character: {
      id: "chris",
      name: "Chris",
      identity: "",
      voice: { style: "", mannerisms: [] },
      personality: [],
    } as any,
    handling: "truth",
    systemInstruction: "x",
    relevantMemories: [],
    ...overrides,
  } as NarrationContext;
}

describe("narrator status — epistemic boundary", () => {
  it("model-voiced character line (truth) is stamped TESTIMONY, not CANONICAL", async () => {
    const n = makeNarrator();
    const out = await n.narrate(characterCtx({ handling: "truth" }));
    expect(out.lines[0].status).toBe("testimony");
  });

  it("model-voiced withhold line is stamped TESTIMONY (palette now reflects evasion)", async () => {
    const n = makeNarrator();
    const out = await n.narrate(characterCtx({ handling: "withhold", seed: "x" }));
    expect(out.lines[0].status).toBe("testimony");
  });

  it("pure third-person narration line stays CANONICAL", async () => {
    const n = makeNarrator();
    const out = await n.narrate(
      characterCtx({ character: undefined, handling: undefined })
    );
    expect(out.lines[0].status).toBe("canonical");
  });
});
