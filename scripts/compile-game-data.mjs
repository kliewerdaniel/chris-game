#!/usr/bin/env node
/**
 * Compile-time character/world compiler for CHRIS.
 *
 * This does NOT re-derive the knowledge graph. It CONSUMES the pre-built
 * compilation layer already produced by the existing pipeline in
 * ~/Projects/Chris/artifacts/chris/ (traits, quotes, memories, relationships,
 * timeline, graph, values, review_queue). Those artifacts are the authoritative
 * source. This script curates a minimal, game-ready slice so the runtime never
 * has to load or parse the raw corpora.
 *
 * Output: data/compiled/  (gitignored, regenerable).
 *
 * Reuses the existing compiler output. It does not duplicate thousands of
 * source records into the game, and it never sends anything to a cloud.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(process.env.CHRIS_ARTIFACTS ?? "~/Projects/Chris/artifacts/chris");
const OUT = join(ROOT, "data", "compiled");

function expand(p) {
  return p.startsWith("~") ? join(process.env.HOME ?? "/Users/danielkliewer", p.slice(1)) : p;
}

function readJsonSafe(file) {
  const p = expand(join(SRC, file));
  if (!existsSync(p)) {
    console.warn(`[compile] missing source: ${p}`);
    return null;
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

function main() {
  mkdirSync(OUT, { recursive: true });

  const memoriesRaw = readJsonSafe("memories.json") ?? [];
  const traits = readJsonSafe("traits.json") ?? [];
  const relationships = readJsonSafe("relationships.json") ?? [];
  const timeline = readJsonSafe("timeline.json") ?? [];
  const quotes = readJsonSafe("quotes.json") ?? [];
  const reviewQueue = readJsonSafe("review_queue.json") ?? [];
  const graph = readJsonSafe("graph.json") ?? { nodes: [], edges: [] };
  const values = readJsonSafe("values.json") ?? [];

  // --- Curate memories into the retrieval-ready shape with provenance ---
  // Keep only memories relevant to the in-game characters/world (Chris, Sarge,
  // the player, Captain). Tag kind from the source review_queue policy.
  const KEEP_ENTITIES = new Set(["chris", "Chris", "sarge", "Sarge", "captain", "Captain", "player", "mother"]);
  const curatedMemories = memoriesRaw
    .filter((m) => Array.isArray(m.entities) && m.entities.some((e) => KEEP_ENTITIES.has(e.name)))
    .slice(0, 80)
    .map((m, i) => ({
      id: m.memory_id ?? `mem_${i}`,
      text: (m.summary || m.original_context || "").toString().slice(0, 600),
      kind: classifyKind(m),
      status: "belief",
      date: m.date_written ?? null,
      provenance: {
        source: m.source ?? "compiled",
        sourceType: "compiled_event",
        sourceId: m.memory_id ?? `mem_${i}`,
        confidence: 0.7,
      },
    }));

  // --- Epistemic review flags (the unreliable-testimony mechanic) ---
  const epistemicFlags = reviewQueue.map((r) => ({
    claim: r.claim,
    confidence: r.confidence,
    needsReview: r.needs_review,
    reason: r.reason,
  }));

  const out = {
    version: 1,
    compiledAt: new Date().toISOString(),
    source: "~/Projects/Chris/artifacts/chris (pre-built compilation layer)",
    character: {
      id: "chris",
      traits: traits.slice(0, 40).map((t) => t.trait),
      values: values.slice(0, 30).map((v) => v.value),
      relationships: relationships.slice(0, 20),
      timelineSummary: timeline.slice(0, 10).map((t) => ({ date: t.date, count: t.count })),
      quotesSample: quotes.slice(0, 15).map((q) => q.quote),
    },
    memories: curatedMemories,
    graphStats: { nodes: graph.nodes?.length ?? 0, edges: graph.edges?.length ?? 0 },
    epistemicFlags,
  };

  writeFileSync(join(OUT, "chris.json"), JSON.stringify(out, null, 2));
  console.log(
    `[compile] wrote data/compiled/chris.json — ${curatedMemories.length} curated memories, ${traits.length} traits, ${epistemicFlags.length} epistemic flags`
  );
}

/**
 * Classify a raw memory's reliability using the source review_queue policy:
 * the corpus interleaves performed/fiction with genuine memory. We mark
 * memories that look like roleplay/fiction accordingly so the retrieval layer
 * can surface the distinction to the player.
 */
function classifyKind(m) {
  const text = ((m.summary || "") + " " + (m.original_context || "")).toLowerCase();
  if (/alien cats|roach|randall|booka|firefly|character gets up/.test(text)) return "fiction";
  if (/story|continue the|roleplay|as an ai|imagine/.test(text)) return "performed";
  if (/grief|died|loss|memorial|sarge|chris|mother/.test(text)) return "genuine";
  return "mixed";
}

main();
