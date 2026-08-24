import { WorldState, WorldSnapshot, GameAction } from "../core/types";
import { FACTS } from "../core/facts";
import { getEvidenceDef } from "../core/evidence";
import { CHARACTERS } from "../characters/chris";

/**
 * ADR-006 — read-only world projection for the narrator.
 *
 * Resolves the live, relevant truth of the world at narration time so chat
 * replies are GROUNDED in what the player has actually found/established.
 * The model reads this projection; it never writes back to WorldState.
 */
export function resolveSnapshot(state: WorldState): WorldSnapshot {
  const knownFacts = (state.knownFacts ?? [])
    .map((id) => FACTS[id])
    .filter(Boolean)
    .map((f) => ({ id: f.id, statement: f.statement, status: f.status }));

  const evidence = (state.evidenceIds ?? [])
    .map((id) => getEvidenceDef(String(id)))
    .filter((e): e is NonNullable<ReturnType<typeof getEvidenceDef>> => !!e)
    .map((e) => ({ id: e.id, title: e.title, content: e.content, status: e.status }));

  const present = Object.keys(state.characterStates ?? {}).filter((cid) =>
    state.characterStates[cid].currentLocation === state.location
  );

  return {
    location: state.location,
    time: formatTime(state.time),
    knownFacts,
    evidence,
    flags: state.flags,
    present,
    phoneUnlocked: state.phoneUnlocked,
    episodeId: state.episodeId,
  };
}

/**
 * ADR-006 — deterministic speaker routing for the universal chat interface.
 *
 *   - An explicit `call <contact>` where the contact is a known character →
 *     that contact (e.g. call mother → mother). The feed steps aside.
 *   - A `call` to an unknown contact, or ANY other input (free prose, talk/ask/
 *     chat to the feed, post-action reaction, nonsense) → `chris` (the
 *     reconstruction / the feed). It is the constant companion.
 *
 * This realizes "whether it be chris or the feed" — the feed IS the
 * reconstruction, so the default voice is `chris`; only a named call routes
 * elsewhere.
 */
export function selectSpeaker(state: WorldState, action: GameAction): string {
  if (action.type === "call" && action.targetId && CHARACTERS[action.targetId]) {
    return action.targetId;
  }
  return "chris";
}

function formatTime(t: { day: number; hour: number; minute: number }): string {
  const h = ((t.hour + 11) % 12) + 1;
  const ampm = t.hour < 12 ? "AM" : "PM";
  const mm = t.minute.toString().padStart(2, "0");
  return `Day ${t.day}, ${h}:${mm} ${ampm}`;
}
