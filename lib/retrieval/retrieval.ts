import { CharacterMemory } from "../core/types";

export interface RetrievedMemory {
  id: string;
  text: string;
  kind: "genuine" | "performed" | "fiction" | "mixed";
  status: string;
  provenance: { source: string; sourceType: string; sourceId: string; confidence: number };
  /** embedding, when local inference is available. */
  embedding?: number[];
}

/**
 * The retrieval layer queries the COMPILED knowledge, never the raw corpus.
 *
 * Provenance is preserved on every retrieved item so the UI can show whether a
 * memory is GENUINE, PERFORMED (roleplay), FICTION, or MIXED — directly from
 * the Chris artifacts review_queue, which flagged that the corpus interleaves
 * performed and genuine memory.
 *
 * Semantic retrieval is OPTIONAL: if embeddings are present on items (produced
 * at compile time by Ollama nomic-embed-text), we do cosine similarity. If not,
 * we fall back to deterministic keyword overlap. The game never requires a
 * cloud call to retrieve.
 */
export class Retrieval {
  constructor(private memories: RetrievedMemory[]) {}

  setEmbeddings(map: Record<string, number[]>) {
    for (const m of this.memories) {
      if (map[m.id]) m.embedding = map[m.id];
    }
  }

  /** Top-k by semantic similarity if embeddings exist, else keyword overlap. */
  search(query: string, k = 5): RetrievedMemory[] {
    if (this.memories.length === 0) return [];
    const probe = this.memories[0].embedding;
    if (probe) {
      const q = embedLocalFallback(query); // query embedding requires provider;
      // if no live embedding callable here, fall back to keyword.
      const scored = this.memories.map((m) => ({
        m,
        s: m.embedding ? cosine(q, m.embedding) : keywordScore(query, m.text),
      }));
      scored.sort((a, b) => b.s - a.s);
      return scored.slice(0, k).map((x) => x.m);
    }
    const scored = this.memories.map((m) => ({ m, s: keywordScore(query, m.text) }));
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, k).map((x) => x.m);
  }

  byKind(kind: RetrievedMemory["kind"]): RetrievedMemory[] {
    return this.memories.filter((m) => m.kind === kind);
  }

  bySource(sourceId: string): RetrievedMemory[] {
    return this.memories.filter((m) => m.provenance.sourceId === sourceId);
  }

  get(id: string): RetrievedMemory | undefined {
    return this.memories.find((m) => m.id === id);
  }
}

export function keywordScore(query: string, text: string): number {
  const q = query.toLowerCase().split(/\W+/).filter(Boolean);
  const t = text.toLowerCase();
  let score = 0;
  for (const term of q) if (t.includes(term)) score += 1;
  return score;
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Deterministic local embedding stand-in. The real path uses Ollama
 * nomic-embed-text at runtime (see inference/ollama.ts). For in-engine
 * retrieval scoring we hash tokens into a stable vector so the layer is usable
 * without a live provider and fully deterministic/testable. When a real
 * embedding is supplied via setEmbeddings, it overrides this.
 */
export function embedLocalFallback(text: string): number[] {
  const vec = new Array(64).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const tok of tokens) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) {
      h = (h * 31 + tok.charCodeAt(i)) >>> 0;
    }
    const idx = h % 64;
    vec[idx] += 1;
  }
  return vec;
}

/** Build a Retrieval from Chris artifact memories (curated, not raw corpus). */
export function buildRetrievalFromMemories(memories: CharacterMemory[]): Retrieval {
  const items: RetrievedMemory[] = memories.map((m) => ({
    id: m.id,
    text: m.text,
    kind: m.kind,
    status: m.status,
    provenance: m.provenance,
  }));
  return new Retrieval(items);
}
