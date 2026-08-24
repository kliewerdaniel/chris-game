import { describe, it, expect } from "vitest";
import { createWorldState, serializeWorldState, deserializeWorldState, addKnownFact } from "../lib/core/world";
import { instantiateEvidence, markDiscovered } from "../lib/core/evidence";
import { createDefaultEngine, GameEngine } from "../lib/engine/game-engine";
import { MockProvider, InferenceManager } from "../lib/inference/provider";
import { buildRetrievalFromMemories } from "../lib/retrieval/retrieval";
import { CHRIS } from "../lib/characters/chris";

function mockEngine() {
  const inference = new InferenceManager([new MockProvider(() => "[mock]")]);
  const retrieval = buildRetrievalFromMemories(CHRIS.memories);
  const narrator = { buildContext: () => ({}) as any, narrate: async () => ({ lines: [{ speaker: "narrator", text: "[mock]" }], usedModel: false, simulated: true }) } as any;
  return new GameEngine({ retrieval, narrator, inference });
}

describe("Save / Load persistence", () => {
  it("world state survives serialize → deserialize losslessly", () => {
    let s = createWorldState({ startLocation: "apartment_living", characterIds: ["chris"] });
    s = addKnownFact(s, "ep1.sarge.dead");
    s = { ...s, evidenceIds: ["ev_chris_note"], phoneUnlocked: true };
    const rt = deserializeWorldState(serializeWorldState(s));
    expect(rt).toEqual(s);
  });

  it("evidence discovery is preserved across a save/load cycle", () => {
    let s = createWorldState({ startLocation: "x", characterIds: [] });
    const ev = markDiscovered(instantiateEvidence("ev_chris_note"));
    s = { ...s, evidenceIds: [ev.id] };
    const recovered = deserializeWorldState(serializeWorldState(s));
    expect(recovered.evidenceIds).toContain("ev_chris_note");
  });

  it("a played episode state can be resumed and continued", async () => {
    const eng = mockEngine();
    let s = eng.newGame();
    const r1 = await eng.processTurn(s, "examine the note");
    s = r1.state;
    expect(s.evidenceIds).toContain("ev_chris_note");
    // serialize, deserialize (simulating reload), continue playing
    const restored = deserializeWorldState(serializeWorldState(s));
    const r2 = await eng.processTurn(restored, "sleep");
    expect(r2.state.episodeComplete).toBe(true);
  });
});
