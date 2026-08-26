/**
 * M2 — Player reconstruction-graph actions (engine-level dispatch).
 *
 * Game-wide handlers for hypothesize / connect / test. Mirrors `doChallenge`:
 * returns the same `{ state, result }` shape, deterministic, fail-closed, and
 * never asserts world-truth. These mutate ONLY the player's own reconstruction
 * layer (`state.playerNodes` / `state.playerEdges`); they never touch canonical
 * facts. The engine evaluates the player's model against the canonical graph
 * and reports corroboration / divergence — the player decides what to believe.
 *
 * This keeps the frozen-spine boundary intact: investigation LOGIC (the
 * canonical graph, fact statuses, the disclosure engine) is read-only here.
 */

import type { WorldState, GameAction, ActionResult, NarrationLine } from "../core/types";
import {
  hypothesize as pgHypothesize,
  connect as pgConnect,
  testNode as pgTest,
  resolveAnchor,
  type PlayerEdgeKind,
} from "../core/player-graph";

function toActionResult(lines: string[], next: WorldState, ok: boolean): ActionResult {
  const narration: NarrationLine[] = lines.map((text, i) =>
    i === 0
      ? { speaker: "player", text }
      : { speaker: "system", text, status: "observation" }
  );
  return {
    ok,
    narration,
    events: [],
    stateChanges: { playerGraph: true },
  } as ActionResult;
}

/**
 * Route a player-graph action. Returns `null` when the action type is not an
 * M2 verb (so the engine falls through to episode dispatch / chat).
 */
export function doReconstruct(
  state: WorldState,
  action: GameAction
): { state: WorldState; result: ActionResult } | null {
  const raw = (action.raw ?? "").trim();

  if (action.type === "hypothesize") {
    // Anchor to a canonical fact id if the player named one ("... re: ep1.she").
    const m = raw.match(/re:\s*([a-z0-9_.]+)/i);
    const anchor = m ? resolveAnchor(m[1]) : undefined;
    const text = raw.replace(/re:\s*[a-z0-9_.]+/i, "").trim() || raw;
    const r = pgHypothesize(state, text, anchor);
    return { state: r.state, result: toActionResult(r.lines, r.state, r.ok) };
  }

  if (action.type === "connect") {
    // Parse "connect <A> <kind> <B>" — kind optional (defaults supports).
    const m = raw.match(/connect\s+([a-z0-9_.]+)\s*(supports|contradicts|relatesTo|to)?\s*([a-z0-9_.]+)?/i);
    const from = m ? resolveAnchor(m[1]) ?? m[1] : undefined;
    const kind: PlayerEdgeKind = (m && (m[2] as PlayerEdgeKind)) ?? "supports";
    const to = m && m[3] ? resolveAnchor(m[3]) ?? m[3] : undefined;
    if (!from || !to) {
      const r = pgConnect(state, from ?? "", to ?? "", kind);
      return { state: r.state, result: toActionResult(r.lines, r.state, r.ok) };
    }
    const r = pgConnect(state, from, to, kind);
    return { state: r.state, result: toActionResult(r.lines, r.state, r.ok) };
  }

  if (action.type === "test") {
    // "test <nodeId or canonical fact id>".
    const m = raw.match(/test\s+(?:node\s+)?([a-z0-9_:~.\-]+)/i);
    const token = m ? m[1] : undefined;
    if (!token) {
      const r = pgTest(state, "");
      return { state: r.state, result: toActionResult(r.lines, r.state, r.ok) };
    }
    const anchor = resolveAnchor(token) ?? token;
    const r = pgTest(state, anchor);
    return { state: r.state, result: toActionResult(r.lines, r.state, r.ok) };
  }

  return null;
}
