import { describe, it, expect } from "vitest";
import { GameEngine } from "../lib/engine/game-engine";
import { MockProvider, InferenceManager } from "../lib/inference/provider";
import { buildRetrievalFromMemories } from "../lib/retrieval/retrieval";
import { CHRIS } from "../lib/characters/chris";
import { FACTS2, FACTS3, FACTS4, allFacts } from "../lib/core/facts";

function mockEngine() {
  const inference = new InferenceManager([new MockProvider(() => "[mock]")]);
  const retrieval = buildRetrievalFromMemories(CHRIS.memories);
  const narrator = {
    buildContext: () => ({}) as any,
    narrate: async (ctx: any) => ({
      lines: [{ speaker: ctx.character ? "chris" : "narrator", text: "[mock]" }],
      usedModel: false,
      simulated: true,
    }),
  } as any;
  return new GameEngine({ retrieval, narrator, inference });
}

describe("Episode 2 — THE PORCH", () => {
  const eng = mockEngine();

  it("starts at the cabin with Chris alive and teaching quest active", () => {
    const s = eng.newGame("ep2");
    expect(s.episodeId).toBe("ep2");
    expect(s.location).toBe("cabin_porch");
    expect(s.quests["ep2.learn"].status).toBe("active");
    expect(FACTS2["ep2.chris.alive"].status).toBe("canonical");
  });

  it("carries Ep1 evidence + known facts forward (continuity)", () => {
    // Simulated Ep1 end state: player found the note, learned with_sarge.
    let carry = eng.newGame("ep1");
    carry = { ...carry, evidenceIds: ["ev_chris_note"], knownFacts: ["ep1.chris.with_sarge", "ep1.chris.owes_money"] };
    const ep2 = eng.nextEpisode(carry);
    expect(ep2).not.toBeNull();
    expect(ep2!.episodeId).toBe("ep2");
    expect(ep2!.evidenceIds).toContain("ev_chris_note");
    expect(ep2!.knownFacts).toContain("ep1.chris.with_sarge");
  });

  it("discovering the discharge paper contradicts Chris's 'clean exit' testimony", async () => {
    const s = eng.newGame("ep2");
    const { state } = await eng.processTurn(s, "examine the envelope");
    expect(state.evidenceIds).toContain("ev_discharge_paper");
    expect(state.knownFacts).toContain("ep2.chris.corps_discharge");
    // the evidence definition contradicts the testimony fact
    expect(FACTS2["ep2.chris.corps_discharge"].status).toBe("testimony");
  });
});

describe("Episode 3 — THE LAST CALL", () => {
  const eng = mockEngine();

  it("starts with Chris declining and the player's company a canonical fact", () => {
    const s = eng.newGame("ep3");
    expect(s.episodeId).toBe("ep3");
    expect(s.quests["ep3.truth"].status).toBe("active");
    expect(FACTS3["ep3.chris.declining"].status).toBe("canonical");
    expect(FACTS3["ep3.player.company"].status).toBe("canonical");
  });

  it("the pills contradict Chris's 'I'm fine' testimony when examined", async () => {
    const s = eng.newGame("ep3");
    const { state } = await eng.processTurn(s, "examine the pills");
    expect(state.evidenceIds).toContain("ev_med_bottle");
    expect(state.knownFacts).toContain("ep3.chris.fine");
  });

  it("confronting Chris reveals the Sarge truth (canonical)", async () => {
    const s = eng.newGame("ep3");
    const { state } = await eng.processTurn(s, "confront Chris");
    expect(state.evidenceIds).toContain("ev_chris_truth");
    expect(state.knownFacts).toContain("ep3.chris.truth_sarge");
  });
});

describe("Episode 4 — THE REBUILD", () => {
  const eng = mockEngine();

  it("Chris is gone; the reconstruction is the interlocutor", () => {
    const s = eng.newGame("ep4");
    expect(s.episodeId).toBe("ep4");
    expect(FACTS4["ep4.chris.dead"].status).toBe("canonical");
    expect(FACTS4["ep4.reconstruction.is_model"].status).toBe("canonical");
  });

  it("examining the envelope establishes the echo-vs-voice crux", async () => {
    const s = eng.newGame("ep4");
    const { state } = await eng.processTurn(s, "examine the envelope");
    expect(state.evidenceIds).toContain("ev_chris_final_note");
    expect(state.knownFacts).toContain("ep4.reconstruction.is_model");
  });

  it("examining the output log establishes the reconstruction-as-model fact", async () => {
    const s = eng.newGame("ep4");
    const { state } = await eng.processTurn(s, "examine the output log");
    expect(state.evidenceIds).toContain("ev_reconstruction_log");
    expect(state.knownFacts).toContain("ep4.reconstruction.is_model");
  });

  it("the reconstruction's 'remembering' is only rumor, never canonical", () => {
    expect(FACTS4["ep4.reconstruction.remembers"].status).toBe("rumor");
    expect(FACTS4["ep4.reconstruction.remembers"].claimedBy).toBe("reconstruction");
  });

  it("closing the model completes the finale", async () => {
    const s = eng.newGame("ep4");
    const { state } = await eng.processTurn(s, "close the laptop");
    expect(state.episodeComplete).toBe(true);
    expect(state.endingId).toBe("ep4.closed");
  });
});

describe("Episode continuity chain", () => {
  const eng = mockEngine();

  it("ep1 -> ep2 -> ep3 -> ep4 all reachable and ordered", () => {
    let s = eng.newGame("ep1");
    s = eng.nextEpisode(s)!;
    expect(s.episodeId).toBe("ep2");
    s = eng.nextEpisode(s)!;
    expect(s.episodeId).toBe("ep3");
    s = eng.nextEpisode(s)!;
    expect(s.episodeId).toBe("ep4");
    expect(eng.nextEpisode(s)).toBeNull(); // ep4 is the finale
  });

  it("all episode fact catalogs merge without collision", () => {
    const merged = allFacts();
    expect(Object.keys(merged).length).toBeGreaterThan(0);
    expect(merged["ep1.sarge.dead"]).toBeDefined();
    expect(merged["ep2.cabin"]).toBeDefined();
    expect(merged["ep3.chris.declining"]).toBeDefined();
    expect(merged["ep4.chris.dead"]).toBeDefined();
  });
});

describe("Epistemic integrity preserved across episodes", () => {
  it("every canonical fact carries provenance; testimony carries claimedBy", () => {
    const merged = allFacts();
    for (const f of Object.values(merged)) {
      expect(f.provenance).toBeDefined();
      if (f.status === "testimony") expect(f.claimedBy).toBeDefined();
    }
  });
});
