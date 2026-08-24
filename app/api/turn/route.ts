import { NextRequest, NextResponse } from "next/server";
import { GameEngine, createDefaultEngine } from "@/lib/engine/game-engine";
import { buildInferenceManager } from "@/lib/inference/provider";
import { serializeWorldState, deserializeWorldState } from "@/lib/core/world";
import { CHRIS } from "@/lib/characters/chris";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One engine instance per server process (inference manager is stateless per call).
let engine: GameEngine | null = null;
function getEngine(): GameEngine {
  if (!engine) {
    const inference = buildInferenceManager();
    engine = createDefaultEngine(inference);
  }
  return engine;
}

interface TurnBody {
  state: string; // serialized WorldState
  input: string;
}

export async function POST(req: NextRequest) {
  let body: TurnBody;
  try {
    body = (await req.json()) as TurnBody;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof body.input !== "string" || typeof body.state !== "string") {
    return NextResponse.json({ error: "input and state required" }, { status: 400 });
  }

  let state;
  try {
    state = deserializeWorldState(body.state);
  } catch {
    // No valid state → start a new game.
    state = getEngine().newGame();
  }

  const { state: next, result } = await getEngine().processTurn(state, body.input);

  return NextResponse.json({
    state: serializeWorldState(next),
    narration: result.narration,
    ok: result.ok,
    reason: result.reason,
    discoveredEvidence: result.discoveredEvidence ?? [],
    establishedFacts: result.establishedFacts ?? [],
    character: result.ok ? { chrisTrust: next.characterStates.chris?.trust } : undefined,
  });
}

export async function GET() {
  // Lightweight capability probe: which providers are configured LOCAL-only.
  const inference = buildInferenceManager();
  return NextResponse.json({
    character: CHRIS.name,
    providers: inference.activeProviders,
    localOnly: true,
    note: "No cloud provider is ever used. Inference is local-first and fail-closed.",
  });
}
