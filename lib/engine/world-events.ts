import { WorldState, NarrationLine } from "../core/types";
import { addEvent } from "../core/world";

/**
 * P4 — SCHEDULED WORLD EVENTS.
 *
 * Deterministic, engine-owned events that fire when the world reaches a
 * condition (a time, a flag, an episode boundary, or a discovered piece of
 * evidence). Every event carries SEeded, canonical narration — the model is
 * never asked to invent world happenings. This is the structural backbone for
 * the "the world keeps moving" feel without any simulation/LLM risk.
 *
 * Events are idempotent: once fired (tracked in `state.firedEventIds`) they
 * never fire again, so the board is stable across turns.
 */

export type WorldEventTrigger =
  | { type: "time"; day?: number; hour?: number; minute?: number }
  | { type: "flag"; flag: string; value?: boolean | number | string }
  | { type: "episode"; episodeId: string }
  | { type: "evidence"; evidenceId: string };

export interface WorldEventDef {
  id: string;
  title: string;
  description: string;
  trigger: WorldEventTrigger;
  /** deterministic, fail-closed narration shown when the event fires. */
  narration: NarrationLine[];
  /** optional rule-driven state effects applied when the event fires. */
  effects?: (s: WorldState) => WorldState;
}

export const WORLD_EVENTS: WorldEventDef[] = [
  {
    id: "ev_clock_23",
    title: "The clock strikes eleven",
    description: "The clock ticks past 11. Chris hasn't moved from the couch.",
    trigger: { type: "time", hour: 23 },
    narration: [{ speaker: "system", text: "The clock ticks past 11. Chris hasn't moved. The silence has weight now.", status: "canonical" }],
  },
  {
    id: "ev_flag_found_note",
    title: "The note changes the air",
    description: "Something shifts in the room once the note is read.",
    trigger: { type: "flag", flag: "ep1.found_note" },
    narration: [{ speaker: "system", text: "Something in the room's stillness changes once you've read the note. Chris feels it too.", status: "canonical" }],
  },
  {
    id: "ev_ep2_arrival",
    title: "Dawn at the porch",
    description: "Dawn comes. The porch light flickers.",
    trigger: { type: "episode", episodeId: "ep2" },
    narration: [{ speaker: "system", text: "Dawn comes. The porch light flickers, and the night's questions follow you into the morning.", status: "canonical" }],
  },
  {
    id: "ev_ep2_confronted",
    title: "Chris meets your eyes",
    description: "The player confronted Chris on the porch; something settles between them.",
    trigger: { type: "flag", flag: "ep2.confronted" },
    narration: [{ speaker: "system", text: "Chris looks at you a long moment. 'You're more like me than I wanted,' he says, and lets it stand.", status: "canonical" }],
  },
  {
    id: "ev_ep3_arrival",
    title: "Years later",
    description: "The last call. Years have passed.",
    trigger: { type: "episode", episodeId: "ep3" },
    narration: [{ speaker: "system", text: "Years have passed. The phone on the table is a different phone, the room a different room, but the weight in it is the same one.", status: "canonical" }],
  },
  {
    id: "ev_ep3_truth",
    title: "The toll, named",
    description: "Daniel named the toll; the reconstruction kept talking.",
    trigger: { type: "flag", flag: "ep3.confronted" },
    narration: [{ speaker: "system", text: "He said it. The room is different now that it's been spoken — lighter, and heavier, both.", status: "canonical" }],
  },
  {
    id: "ev_ep4_arrival",
    title: "The screens",
    description: "The rebuild. The reconstruction waits.",
    trigger: { type: "episode", episodeId: "ep4" },
    narration: [{ speaker: "system", text: "The screens have been dark. You power one on, and his voice is already there, waiting, exactly where you left it.", status: "canonical" }],
  },
  {
    id: "ev_ep4_letter",
    title: "The sealed envelope",
    description: "The player found Chris's final envelope. Its weight settles the room.",
    trigger: { type: "flag", flag: "ep4.found_letter" },
    narration: [{ speaker: "system", text: "The envelope is heavier than paper should be. You set it down, not yet ready to open what he left for after.", status: "canonical" }],
  },
  {
    id: "ev_evidence_source_post",
    title: "The post is read",
    description: "The post is read; its weight settles into the room.",
    trigger: { type: "evidence", evidenceId: "ev_source_post" },
    narration: [{ speaker: "system", text: "You read the words you actually wrote. The reconstruction is real. The toll is real. You set the phone down, not yet ready to hear it answer.", status: "canonical" }],
  },
];

function timeReached(
  now: { day: number; hour: number; minute: number },
  t: { day?: number; hour?: number; minute?: number }
): boolean {
  const hour = t.hour ?? 0;
  const minute = t.minute ?? 0;
  if (t.day !== undefined) {
    // Absolute trigger: compare total minutes from day-zero.
    const nowMin = now.day * 1440 + now.hour * 60 + now.minute;
    const trigMin = t.day * 1440 + hour * 60 + minute;
    return nowMin >= trigMin;
  }
  // No day specified: trigger fires "today" — compare hour:minute within the
  // current day so a start time of day 1, hour 22 doesn't fire a day-0 hour-23.
  return now.hour * 60 + now.minute >= hour * 60 + minute;
}

export function isDue(ev: WorldEventDef, state: WorldState): boolean {
  const t = ev.trigger;
  switch (t.type) {
    case "time":
      return timeReached(state.time, t);
    case "flag": {
      const v = state.flags[t.flag];
      if (t.value !== undefined) return v === t.value;
      return v !== undefined && v !== false && v !== 0 && v !== "";
    }
    case "episode":
      return state.episodeId === t.episodeId;
    case "evidence":
      return state.evidenceIds.includes(t.evidenceId);
  }
}

/** Events that are due but have not yet fired for this state. */
export function collectDueEvents(state: WorldState): WorldEventDef[] {
  const fired = state.firedEventIds ?? [];
  return WORLD_EVENTS.filter((ev) => !fired.includes(ev.id) && isDue(ev, state));
}

/**
 * Apply any due world events to the state. Idempotent: fired ids are recorded
 * so an event never double-fires. Returns the advanced state plus the events
 * that actually fired this call (for narration merging).
 */
export function applyWorldEvents(state: WorldState): { state: WorldState; fired: WorldEventDef[] } {
  const firedIds = [...(state.firedEventIds ?? [])];
  let next = state;
  const fired: WorldEventDef[] = [];
  for (const ev of WORLD_EVENTS) {
    if (firedIds.includes(ev.id)) continue;
    if (isDue(ev, next)) {
      next = addEvent(next, { id: ev.id, type: "world_event", description: ev.description });
      firedIds.push(ev.id);
      if (ev.effects) next = ev.effects(next);
      fired.push(ev);
    }
  }
  // If nothing fired, return the SAME state reference so callers that compare
  // (e.g. "look does not mutate state") see no change.
  if (fired.length === 0) return { state, fired };
  next = { ...next, firedEventIds: firedIds };
  return { state: next, fired };
}
