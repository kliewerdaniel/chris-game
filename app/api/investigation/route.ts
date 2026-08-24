import { NextRequest, NextResponse } from "next/server";
import { deserializeWorldState } from "@/lib/core/world";
import { buildInvestigationPayload, aggregateInvestigation } from "@/lib/core/investigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only consistency board. Given the current serialized WorldState, returns
 * the player's corroboration map, visible contradictions, and open leads. This
 * is a pure, deterministic derivation over engine-owned state — no inference,
 * no model call. The board reports CORROBORATION and DIVERGENCE; it never
 * asserts a world-truth.
 *
 * Body (one of):
 *   { state: string }                 → single-timeline board (backward-compat)
 *   { states: string[] }              → cross-timeline aggregate (ADR-003 travel)
 */
export async function POST(req: NextRequest) {
  let body: { state?: string; states?: string[] };
  try {
    body = (await req.json()) as { state?: string; states?: string[] };
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Cross-timeline aggregate (travel journal).
  if (Array.isArray(body.states)) {
    let states;
    try {
      states = body.states.map((s) => (typeof s === "string" ? deserializeWorldState(s) : (s as any)));
    } catch {
      return NextResponse.json({ error: "invalid state in states[]" }, { status: 400 });
    }
    if (states.length === 0) {
      return NextResponse.json({ ok: true, episodeId: "all", timelines: [], established: [], discovered: [], corroboration: [], visibleContradictions: [], openLeads: [] });
    }
    const payload = aggregateInvestigation(states);
    return NextResponse.json({ ok: true, ...payload });
  }

  if (typeof body.state !== "string") {
    return NextResponse.json({ error: "state required" }, { status: 400 });
  }
  let state;
  try {
    state = deserializeWorldState(body.state);
  } catch {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }
  const payload = buildInvestigationPayload(state);
  return NextResponse.json({ ok: true, ...payload });
}
