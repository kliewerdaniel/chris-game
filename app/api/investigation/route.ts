import { NextRequest, NextResponse } from "next/server";
import { deserializeWorldState } from "@/lib/core/world";
import { buildInvestigationPayload } from "@/lib/core/investigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only consistency board. Given the current serialized WorldState, returns
 * the player's corroboration map, visible contradictions, and open leads. This
 * is a pure, deterministic derivation over engine-owned state — no inference,
 * no model call. The board reports CORROBORATION and DIVERGENCE; it never
 * asserts a world-truth.
 */
export async function POST(req: NextRequest) {
  let body: { state?: string };
  try {
    body = (await req.json()) as { state?: string };
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
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
