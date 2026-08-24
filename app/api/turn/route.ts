import { NextRequest, NextResponse } from "next/server";
import { GameEngine, createDefaultEngine, EPISODES } from "@/lib/engine/game-engine";
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
  /** when true, transition to the next episode (carrying continuity). */
  advanceEpisode?: boolean;
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

  // Transition to next episode if requested and available.
  if (body.advanceEpisode) {
    let prev;
    try {
      prev = deserializeWorldState(body.state);
    } catch {
      prev = getEngine().newGame();
    }
    const next = getEngine().nextEpisode(prev);
    if (!next) {
      return NextResponse.json({ error: "no next episode", state: body.state }, { status: 400 });
    }
    const ep = EPISODES[next.episodeId];
    return NextResponse.json({
      state: serializeWorldState(next),
      narration: [
        {
          speaker: "system",
          text: `— ${ep.title} —`,
          status: "canonical",
        },
      ],
      ok: true,
      episode: { id: ep.id, title: ep.title, subtitle: ep.subtitle, index: ep.index },
      character: { chrisTrust: next.characterStates.chris?.trust },
    });
  }

  let state;
  try {
    state = deserializeWorldState(body.state);
  } catch {
    // No valid state → start a new game.
    state = getEngine().newGame();
  }

  const { state: next, result } = await getEngine().processTurn(state, body.input);
  const ep = EPISODES[next.episodeId];

  return NextResponse.json({
    state: serializeWorldState(next),
    narration: result.narration,
    ok: result.ok,
    reason: result.reason,
    discoveredEvidence: result.discoveredEvidence ?? [],
    establishedFacts: result.establishedFacts ?? [],
    episodeComplete: next.episodeComplete,
    endingId: next.endingId,
    hasNextEpisode: !!ep.next,
    nextEpisodeId: ep.next,
    episode: { id: ep.id, title: ep.title, subtitle: ep.subtitle, index: ep.index },
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
    episodes: Object.values(EPISODES).map((e) => ({ id: e.id, index: e.index, title: e.title, subtitle: e.subtitle })),
    note: "No cloud provider is ever used. Inference is local-first and fail-closed.",
  });
}
