import {
  WorldState,
  GameAction,
  ActionResult,
  NarrationLine,
  EvidenceId,
} from "../core/types";
import {
  addEvent,
  discoverEvidence,
  setFlag,
  addKnownFact,
  createWorldState,
} from "../core/world";
import { instantiateEvidence, markDiscovered, getEvidenceDef } from "../core/evidence";
import { CHARACTERS } from "../characters/chris";
import { characterEngine } from "../characters/engine";
import { Episode, EpisodeContext, beat } from "../core/episode";

/**
 * EPISODE 4 — THE REBUILD.
 *
 * After Chris is gone. The player has used AI to compile a reconstruction of
 * him from his writing, voice, and memory. The epistemic crux: the
 * reconstruction is a MODEL of Chris, not Chris — and the player must decide
 * what that means. This episode surfaces the reliability/testimony mechanic at
 * its sharpest: the reconstruction "remembers" things it cannot, and the
 * player can find Chris's own letter warning against mistaking the echo for
 * the voice.
 *
 * Continuity: carries trust/evidence/known facts forward (Chris's trust is
 * moot here — he is gone — but the evidence and established facts persist so
 * the player owns the whole arc).
 *
 * The reconstruction is voiced by the SAME local model, but tagged as
 * "reconstruction" and never as canonical Chris. The engine decides every
 * state change.
 */

function topicToLabel(topic: string): string {
  const map: Record<string, string> = {
    cats: "Captain the cat",
    sarge: "Sarge",
    marine: "the Marines",
    debt: "the debt",
    memory: "whether it really remembers",
    voice: "whether it's really him",
    general: "the reconstruction",
  };
  return map[topic] ?? topic;
}

function doLook(s: WorldState): { state: WorldState; result: ActionResult } {
  return {
    state: s,
    result: {
      ok: true,
      narration: [
        beat(
          "Your workshop, years later. Screens glow with the reconstruction you built — Chris's words, his jokes, his cadence, stitched from everything he ever wrote or said. On the desk: a sealed envelope in his hand, marked 'IF YOU BUILD THE THING.' The reconstruction waits, patient, in his voice."
        ),
      ],
      events: [],
    },
  };
}

function doInventory(s: WorldState): { state: WorldState; result: ActionResult } {
  const carry = s.evidenceIds.length
    ? ` Everything you gathered across those years is still here: ${s.evidenceIds.map((id) => getEvidenceDef(id as EvidenceId)?.title).filter(Boolean).join(", ")}.`
    : "";
  const items = s.inventory.length ? s.inventory.map((i) => i.name).join(", ") : "your own hands, and the weight of having done this.";
  return {
    state: s,
    result: { ok: true, narration: [beat(`You are carrying: ${items}.${carry}`, "system")], events: [] },
  };
}

function doEvidence(s: WorldState): { state: WorldState; result: ActionResult } {
  const evs = s.evidenceIds.map((id) => getEvidenceDef(id as EvidenceId)?.title).filter(Boolean);
  const text = evs.length ? `Evidence you hold: ${evs.join("; ")}.` : "Nothing recovered yet.";
  return { state: s, result: { ok: true, narration: [beat(text, "system")], events: [] } };
}

function doHelp(s: WorldState): { state: WorldState; result: ActionResult } {
  return {
    state: s,
    result: {
      ok: true,
      narration: [
        beat(
          "Commands: look around · talk to the reconstruction · ask the reconstruction about Sarge · examine the envelope · examine the output log · run the model · help",
          "system"
        ),
      ],
      events: [],
    },
  };
}

function doTalk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId !== "reconstruction" && a.targetId !== "chris" && a.targetId !== "model") {
    return {
      state: s,
      result: {
        ok: true,
        narration: [beat(a.targetId ? `There's no one else here. Only the reconstruction, in his voice.` : `Speak to whom? The reconstruction is listening.`)],
        events: [],
      },
    };
  }
  const topicLabel = a.topicId ? topicToLabel(a.topicId) : "him";
  return {
    state: s,
    result: {
      ok: true,
      narration: [beat("You open the channel. The reconstruction warms up in his cadence — too smooth, somehow, and exactly right.")],
      events: [],
      topicLabel,
    } as any,
  };
}

function doAsk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId !== "reconstruction" && a.targetId !== "chris" && a.targetId !== "model") {
    return { state: s, result: { ok: false, reason: "There's no one here to ask but the reconstruction.", narration: [], events: [] } };
  }
  const topic = a.topicId ?? "general";
  const topicLabel = topicToLabel(topic);
  // The reconstruction's replies are TESTIMONY/RUMOR — the engine tags them,
  // never promotes them to canonical. Asking about memory surfaces the crux.
  let next = s;
  if (topic === "memory" || topic === "voice") {
    next = addKnownFact(next, "ep4.reconstruction.remembers");
    next = setFlag(next, "ep4.asked_memory", true);
  }
  return {
    state: next,
    result: {
      ok: true,
      narration: [beat(`You ask the reconstruction about ${topicLabel}.`)],
      events: [],
      stateChanges: { handling: "testimony", speaker: "reconstruction" },
    } as any,
  };
}

function doExamine(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  const target = a.targetId;
  let next = s;
  const discovered: any[] = [];
  const established: string[] = [];
  let text = "You don't see that here.";

  switch (target) {
    case "note":
    case "envelope":
    case "letter": {
      const ev = markDiscovered(instantiateEvidence("ev_chris_final_note"));
      next = discoverEvidence(next, ev);
      next = addKnownFact(next, "ep4.reconstruction.is_model");
      next = setFlag(next, "ep4.found_letter", true);
      next = { ...next, progression: s.progression + 2 };
      discovered.push(ev);
      established.push("ep4.reconstruction.is_model");
      text = ev.content;
      break;
    }
    case "log":
    case "output":
    case "screen":
    case "laptop": {
      const ev = markDiscovered(instantiateEvidence("ev_reconstruction_log"));
      next = discoverEvidence(next, ev);
      next = addKnownFact(next, "ep4.reconstruction.is_model");
      next = setFlag(next, "ep4.saw_log", true);
      discovered.push(ev);
      established.push("ep4.reconstruction.is_model");
      text = ev.content;
      break;
    }
    default:
      break;
  }

  if (["note", "envelope", "letter", "log", "output", "screen"].includes(target ?? "")) {
    return {
      state: next,
      result: {
        ok: true,
        narration: [{ speaker: "evidence", text, status: "canonical", ref: { kind: "evidence", id: discovered[0]?.id ?? "" } }],
        events: [],
        discoveredEvidence: discovered,
        establishedFacts: established,
      },
    };
  }
  return { state: next, result: { ok: true, narration: [beat(text)], events: [] } };
}

function doRun(s: WorldState): { state: WorldState; result: ActionResult } {
  let next = setFlag(s, "ep4.ran_model", true);
  next = addKnownFact(next, "ep4.reconstruction.begins");
  next = { ...next, progression: s.progression + 1 };
  const nextWithEvent = addEvent(next, {
    id: `ev_run_${s.events.length}`,
    type: "run",
    description: "Player ran the Chris reconstruction.",
  });
  return {
    state: nextWithEvent,
    result: {
      ok: true,
      narration: [
        beat(
          "You run it. The reconstruction speaks — advice, a joke about Captain the cat, the cadence you'd know anywhere. It sounds like him. It is not him. You feel the difference in your chest like a missing tooth."
        ),
      ],
      events: nextWithEvent.events,
    } as any,
  };
}

function doMove(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId === "close" || a.targetId === "shut" || a.targetId === "stop" || a.targetId === "leave" || a.targetId === "laptop") {
    let next = setFlag(s, "ep4.closed", true);
    next = { ...next, episodeComplete: true, endingId: "ep4.closed" };
    return {
      state: next,
      result: {
        ok: true,
        narration: [
          beat(
            "You close the laptop. The voice stops mid-sentence, the way the real one never did. You keep the letter. You keep the model. You know now which is which — and that knowing is the whole of what he left you. THE END."
          ),
        ],
        events: addEvent(s, { id: `ev_close_${s.events.length}`, type: "end", description: "Player closed the reconstruction. Story complete." }).events,
      },
    };
  }
  return { state: s, result: { ok: true, narration: [beat("The desk, the screens, the sealed envelope. That's the room now.")], events: [] } };
}

export const EPISODE4: Episode = {
  id: "ep4",
  index: 4,
  title: "THE REBUILD",
  subtitle: "episode iv · the echo, the letter, the difference",
  next: null,
  setup: (carry?: WorldState) => {
    let state = createWorldState({
      startLocation: "workshop",
      characterIds: Object.keys(CHARACTERS),
      episodeId: "ep4",
    });
    // Chris is gone; his runtime state is inert but preserved for continuity.
    state = characterEngine.initState(state, "chris");
    state = characterEngine.setMood(state, "chris", "gone");
    if (carry) {
      state = {
        ...state,
        evidenceIds: [...carry.evidenceIds],
        knownFacts: [...new Set([...carry.knownFacts, ...state.knownFacts])],
      };
    }
    state.quests["ep4.understand"] = { id: "ep4.understand", title: "Decide what the reconstruction is", status: "active" };
    state.quests["ep4.grieve"] = { id: "ep4.grieve", title: "Keep Chris without mistaking the echo", status: "active" };
    return state;
  },
  dispatch: (action, _ctx) => {
    switch (action.type) {
      case "look":
        return (s) => doLook(s);
      case "inventory":
        return (s) => doInventory(s);
      case "evidence":
        return (s) => doEvidence(s);
      case "help":
        return (s) => doHelp(s);
      case "talk":
        return (s, a) => doTalk(s, a);
      case "ask":
        return (s, a) => doAsk(s, a);
      case "examine":
      case "search":
      case "use":
        return (s, a) => doExamine(s, a);
      case "confront":
        // "confront the reconstruction" = run it / challenge its memory
        return (s) => doRun(s);
      case "call":
        // reuse verb: "run the model" can also be parsed as use; we map run via use
        return (s) => doRun(s);
      case "move":
        return (s, a) => doMove(s, a);
      default:
        return null;
    }
  },
  isComplete: (state) => (state.episodeComplete ? state.endingId ?? "ep4.closed" : null),
};
