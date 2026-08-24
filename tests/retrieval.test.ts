import { describe, it, expect } from "vitest";
import { Retrieval, keywordScore, cosine, embedLocalFallback } from "../lib/retrieval/retrieval";
import { CharacterMemory } from "../lib/core/types";

const mems: CharacterMemory[] = [
  { id: "m1", text: "Chris was a Marine and learned to keep people alive.", kind: "genuine", status: "canonical", provenance: { source: "x", sourceType: "compiled_event", sourceId: "m1", confidence: 0.9 } },
  { id: "m2", text: "Captain the cat and the alien cats outside was a story Chris told the kid.", kind: "fiction", status: "belief", provenance: { source: "x", sourceType: "compiled_event", sourceId: "m2", confidence: 0.7 } },
  { id: "m3", text: "Sarge and Chris were the only family that counted, on the porch.", kind: "genuine", status: "canonical", provenance: { source: "x", sourceType: "compiled_event", sourceId: "m3", confidence: 0.85 } },
];

describe("Retrieval", () => {
  it("keyword search ranks by overlap", () => {
    const r = new Retrieval(mems.map((m) => ({ id: m.id, text: m.text, kind: m.kind, status: m.status, provenance: m.provenance })));
    const top = r.search("Chris Marine", 1);
    expect(top[0].id).toBe("m1");
  });

  it("filters by kind (provenance preserved)", () => {
    const r = new Retrieval(mems.map((m) => ({ id: m.id, text: m.text, kind: m.kind, status: m.status, provenance: m.provenance })));
    const fiction = r.byKind("fiction");
    expect(fiction).toHaveLength(1);
    expect(fiction[0].id).toBe("m2");
  });

  it("semantic search uses embeddings when present", () => {
    const items = mems.map((m) => ({ id: m.id, text: m.text, kind: m.kind, status: m.status, provenance: m.provenance }));
    const r = new Retrieval(items);
    // give each a deterministic embedding via the fallback vectorizer
    const emb: Record<string, number[]> = {};
    for (const m of items) emb[m.id] = embedLocalFallback(m.text);
    r.setEmbeddings(emb);
    const top = r.search("Sarge porch family", 1);
    expect(top[0].id).toBe("m3");
  });

  it("every retrieved item preserves provenance", () => {
    const r = new Retrieval(mems.map((m) => ({ id: m.id, text: m.text, kind: m.kind, status: m.status, provenance: m.provenance })));
    for (const m of r.search("Chris")) {
      expect(m.provenance.sourceType).toBeDefined();
      expect(m.provenance.sourceId).toBeDefined();
    }
  });
});

describe("retrieval math", () => {
  it("cosine of identical vectors is 1", () => {
    const v = [1, 2, 3];
    expect(cosine(v, v)).toBeCloseTo(1);
  });
  it("cosine of orthogonal vectors is 0", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("keywordScore counts term hits", () => {
    expect(keywordScore("chris marine", "Chris was a Marine")).toBe(2);
  });
});
