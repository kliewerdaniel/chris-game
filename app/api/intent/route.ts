import { NextRequest, NextResponse } from "next/server";
import { buildInferenceManager } from "../../../lib/inference/provider";
import {
  resolveIntentWithLLM,
  AllowedActions,
  ALL_VERBS,
} from "../../../lib/inference/llm-intent";
import { guardNarration } from "../../../lib/server/spend-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ADR-011 — PUBLIC NLP INTENT RESOLVER.
 *
 * The deterministic engine runs client-side (ADR-009) with `inference: null`,
 * so the hosted key (server-only) cannot parse input in the browser. This
 * function is the server bridge: it maps a player's free-text utterance to a
 * single closed-schema GameAction via the LLM tool-caller, then the CLIENT
 * re-applies that action through the engine's own dispatch — so the model never
 * mutates state directly and a failed/empty result just falls back to rules.
 *
 * Input:  { raw: string, allowed?: { verbs, targetIds, topicIds } }
 * Output: { action: GameAction | null }
 *
 * Fail-closed:
 *  - guard deny (per-minute / daily budget) → 429
 *  - no provider / model down / unparseable → 200 with action: null
 *    (the client then uses its RULE parser — never a crash, never a cloud probe)
 */

interface IntentBody {
  raw?: unknown;
  allowed?: Partial<AllowedActions>;
}

export async function POST(req: NextRequest) {
  let body: IntentBody;
  try {
    body = (await req.json()) as IntentBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.raw !== "string" || !body.raw.trim()) {
    return NextResponse.json({ error: "missing raw text" }, { status: 400 });
  }

  // ADR-010: count intent calls toward the same spend budget as narration.
  const clamp = guardNarration(body.raw.length, 0, 60);
  if (!clamp.ok) {
    return NextResponse.json(
      { error: "intent throttled", reason: clamp.reason },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let manager;
  try {
    manager = buildInferenceManager();
  } catch {
    manager = null;
  }
  if (!manager) {
    // No model configured → caller uses rule parser. Not an error.
    return NextResponse.json({ action: null });
  }

  const allowed: AllowedActions = {
    verbs: (body.allowed?.verbs as AllowedActions["verbs"]) ?? ALL_VERBS,
    targetIds: body.allowed?.targetIds ?? [],
    topicIds: body.allowed?.topicIds ?? [],
  };

  try {
    const action = await resolveIntentWithLLM(body.raw, manager, allowed);
    // action may be null (model didn't tool-call / bad verb) → client falls back.
    return NextResponse.json({ action: action ?? null });
  } catch {
    // Model down / threw → don't crash the turn; let rules handle it.
    return NextResponse.json({ action: null });
  }
}
