import {
  WorldState,
  GameAction,
  ActionResult,
  NarrationLine,
  EvidenceId,
} from "../core/types";
import {
  advanceTime,
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
 * EPISODE 2 — THE PORCH.
 *
 * Years earlier. Chris is alive and teaching the player to live off-grid in a
 * cabin. The player has ALREADY learned the Ep1 secret (carried forward:
 * ep1.chris.with_sarge / ep1.chris.owes_money are in knownFacts). Here the
 * player can either hold that knowledge quietly or confront Chris about his
 * past — and a NEW contested claim emerges (he left the Corps clean) that the
 * player can disprove with the discharge paper.
 *
 * Continuity: trust and discovered evidence carry in from Ep1 via `setup`.
 */

function topicToLabel(topic: string): string {
  const map: Record<string, string> = {
    sarge: "Sarge",
    "the night": "that night with Sarge",
    money: "the debt",
    corps: "the Marines / how he left",
    marine: "his time in the Marines",
    cabin: "the cabin",
    cats: "Captain the cat",
    general: "the porch",
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
          "Morning at the cabin. Chris is on the porch, a coffee going cold in his hands, watching the treeline. An axe leans by the woodpile. A sealed envelope sits half-shoved under a book on the table — you weren't meant to notice it. A radio mutters weather you don't need."
        ),
      ],
      events: [],
    },
  };
}

function doInventory(s: WorldState): { state: WorldState; result: ActionResult } {
  const carry = s.evidenceIds.length
    ? ` You carry what you learned that night: ${s.evidenceIds
        .map((id) => getEvidenceDef(id as EvidenceId)?.title)
        .filter(Boolean)
        .join(", ")}.`
    : "";
  const items = s.inventory.length
    ? s.inventory.map((i) => i.name).join(", ")
    : "a pocketknife, a lighter, and the clothes you work in.";
  return {
    state: s,
    result: {
      ok: true,
      narration: [beat(`You are carrying: ${items}.${carry}`, "system")],
      events: [],
    },
  };
}

function doEvidence(s: WorldState): { state: WorldState; result: ActionResult } {
  const evs = s.evidenceIds
    .map((id) => getEvidenceDef(id as EvidenceId)?.title)
    .filter(Boolean);
  const text = evs.length
    ? `Evidence you hold: ${evs.join("; ")}.`
    : "You haven't found anything worth keeping yet. Look closer.";
  return {
    state: s,
    result: { ok: true, narration: [beat(text, "system")], events: [] },
  };
}

function doHelp(s: WorldState): { state: WorldState; result: ActionResult } {
  return {
    state: s,
    result: {
      ok: true,
      narration: [
        beat(
          "Commands: look around · talk to Chris · ask Chris about Sarge · ask Chris about the Marines · examine the axe · examine the envelope · confront Chris · help",
          "system"
        ),
      ],
      events: [],
    },
  };
}

function doTalk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId !== "chris") {
    return {
      state: s,
      result: {
        ok: true,
        narration: [beat(a.targetId ? `There's no one else out here but Chris and the trees.` : `Speak to whom? Chris is on the porch.`)],
        events: [],
      },
    };
  }
  let next = characterEngine.setMood(s, "chris", "warm");
  const topicLabel = a.topicId ? topicToLabel(a.topicId) : "the porch";
  return {
    state: next,
    result: {
      ok: true,
      narration: [beat("You sit on the porch step. Chris doesn't look up from the treeline, but he shifts to make room.")],
      events: [],
      topicLabel,
    } as any,
  };
}

function doAsk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId !== "chris") {
    return {
      state: s,
      result: { ok: false, reason: "There's no one here to ask but Chris.", narration: [], events: [] },
    };
  }
  const topic = a.topicId ?? "general";
  const topicLabel = topicToLabel(topic);
  const handling = characterEngine.resolveTopic(s, "chris", topic);

  let next = s;
  if (topic === "corps" || topic === "marine") {
    next = addKnownFact(next, "ep2.chris.corps_discharge");
    next = setFlag(next, "ep2.asked_corps", true);
  }
  if (topic === "sarge" || topic === "the night") {
    next = setFlag(next, "ep2.asked_sarge", true);
  }

  return {
    state: next,
    result: {
      ok: true,
      narration: [beat(`You ask Chris about ${topicLabel}.`)],
      events: [],
      stateChanges: { handling: handling.mode, lieAbout: handling.lieAbout },
    } as any,
  };
}

function doConfront(s: WorldState): { state: WorldState; result: ActionResult } {
  // Confronting Chris about his past here: trust dips, but he softens if the
  // player already knows the Sarge secret (carried from Ep1).
  const knowsSarge = s.knownFacts.includes("ep1.chris.with_sarge");
  let next = characterEngine.adjustTrust(s, "chris", knowsSarge ? -2 : -5);
  next = setFlag(next, "ep2.confronted", true);
  next = { ...next, progression: s.progression + 1 };
  const nextWithEvent = addEvent(next, {
    id: `ev_confront_${s.events.length}`,
    type: "confront",
    description: "Player confronted Chris about his past on the porch.",
  });
  return {
    state: nextWithEvent,
    result: {
      ok: true,
      narration: [
        beat(
          knowsSarge
            ? "You face him. He already knows you know about Sarge. He just says, quiet: \"Then you know I don't talk about the rest for a reason.\""
            : "You face him. The air goes still. Chris sets the coffee down, slow."
        ),
      ],
      events: nextWithEvent.events,
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
    case "axe": {
      const ev = markDiscovered(instantiateEvidence("ev_axe"));
      next = discoverEvidence(next, ev);
      next = setFlag(next, "ep2.saw_axe", true);
      discovered.push(ev);
      text = ev.content;
      break;
    }
    case "note":
    case "envelope":
    case "paper":
    case "discharge": {
      const ev = markDiscovered(instantiateEvidence("ev_discharge_paper"));
      next = discoverEvidence(next, ev);
      next = addKnownFact(next, "ep2.chris.corps_discharge");
      next = setFlag(next, "ep2.found_discharge", true);
      next = characterEngine.liftWithhold(next, "chris", "ep2.chris.corps_discharge");
      next = { ...next, progression: s.progression + 2 };
      discovered.push(ev);
      established.push("ep2.chris.corps_discharge");
      text = ev.content;
      break;
    }
    case "radio": {
      next = setFlag(next, "ep2.heard_radio", true);
      text =
        "The radio spits static, then a weather band: clear, cold nights, no one coming. Chris keeps it on for the silence it proves.";
      break;
    }
    default:
      break;
  }

  if (target === "axe" || target === "note" || target === "envelope" || target === "paper" || target === "discharge" || target === "radio") {
    return {
      state: next,
      result: {
        ok: true,
        narration: [
          {
            speaker: "evidence",
            text,
            status: "canonical",
            ref: { kind: "evidence", id: discovered[0]?.id ?? "" },
          },
        ],
        events: [],
        discoveredEvidence: discovered,
        establishedFacts: established,
      },
    };
  }

  return {
    state: next,
    result: { ok: true, narration: [beat(text)], events: [] },
  };
}

function doMove(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId === "woods" || a.targetId === "tree" || a.targetId === "treeline") {
    let next = setFlag(s, "ep2.walked_woods", true);
    next = { ...next, episodeComplete: true, endingId: "ep2.woods" };
    return {
      state: next,
      result: {
        ok: true,
        narration: [
          beat(
            "You walk to the treeline. Chris doesn't call you back. When you turn, he's still watching — not the woods, but the road behind you. Some lessons are about what's coming, not what's here. The day holds, and so does he."
          ),
        ],
        events: addEvent(s, {
          id: `ev_woods_${s.events.length}`,
          type: "leave",
          description: "Player walked to the treeline. Episode ends on a quiet beat.",
        }).events,
      },
    };
  }
  if (a.targetId === "road" || a.targetId === "away" || a.targetId === "leave") {
    let next = setFlag(s, "ep2.left", true);
    next = { ...next, episodeComplete: true, endingId: "ep2.left" };
    return {
      state: next,
      result: {
        ok: true,
        narration: [
          beat(
            "You step toward the road. Chris's voice stops you, not unkind: \"You go, you go knowing how to keep yourself alive. That's all I wanted.\" The cabin stays. He stays. You could leave, or you could stay and learn the rest."
          ),
        ],
        events: addEvent(s, { id: `ev_leave_${s.events.length}`, type: "leave", description: "Player considered leaving the cabin." }).events,
      },
    };
  }
  return {
    state: s,
    result: { ok: true, narration: [beat("The porch, the woodpile, the treeline. That's the world today.")], events: [] },
  };
}

function doWait(s: WorldState): { state: WorldState; result: ActionResult } {
  const next = advanceTime(s, 60);
  return {
    state: next,
    result: {
      ok: true,
      narration: [beat("An hour passes. A bird lands on the rail, considers Chris, leaves. He hasn't moved.")],
      events: [],
    },
  };
}

export const EPISODE2: Episode = {
  id: "ep2",
  index: 2,
  title: "THE PORCH",
  subtitle: "episode ii · the cabin, the teaching, the paper",
  next: "ep3",
  setup: (carry?: WorldState) => {
    let state = createWorldState({
      startLocation: "cabin_porch",
      characterIds: Object.keys(CHARACTERS),
      episodeId: "ep2",
    });
    state = characterEngine.initState(state, "chris");
    state = characterEngine.setMood(state, "chris", "warm");
    // Continuity: carry trust, evidence, and known facts forward from Ep1.
    if (carry) {
      state = { ...state, characterStates: { ...state.characterStates, chris: { ...state.characterStates.chris, trust: carry.characterStates.chris?.trust ?? state.characterStates.chris.trust, knowsFactIds: [...state.characterStates.chris.knowsFactIds] } } };
      state = { ...state, evidenceIds: [...carry.evidenceIds] };
      state = { ...state, knownFacts: [...new Set([...carry.knownFacts, ...state.knownFacts])] };
      // The discharge secret is withheld until found.
      state = characterEngine.liftWithhold(state, "chris", "ep1.chris.with_sarge"); // already known
    }
    state.quests["ep2.learn"] = { id: "ep2.learn", title: "Learn what Chris will teach", status: "active" };
    state.quests["ep2.truth"] = { id: "ep2.truth", title: "Decide what to do with what you know", status: "active" };
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
      case "wait":
        return (s) => doWait(s);
      case "talk":
        return (s, a) => doTalk(s, a);
      case "ask":
        return (s, a) => doAsk(s, a);
      case "confront":
        return (s) => doConfront(s);
      case "examine":
      case "search":
      case "use":
        return (s, a) => doExamine(s, a);
      case "move":
        return (s, a) => doMove(s, a);
      default:
        return null;
    }
  },
  isComplete: (state) => (state.episodeComplete ? state.endingId ?? "ep2.woods" : null),
};
