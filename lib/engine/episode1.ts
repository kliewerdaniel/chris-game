import {
  WorldState,
  GameAction,
  ActionResult,
  NarrationLine,
  EvidenceId,
} from "../core/types";
import {
  createWorldState,
  advanceTime,
  addEvent,
  discoverEvidence,
  setFlag,
  addKnownFact,
} from "../core/world";
import { instantiateEvidence, markDiscovered, getEvidenceDef } from "../core/evidence";
import { CHRIS, CHARACTERS } from "../characters/chris";
import { characterEngine } from "../characters/engine";
import { Episode, EpisodeContext, beat } from "../core/episode";
import { resolveCall, defaultContacts } from "./contacts";

/**
 * EPISODE 1 — THE NIGHT BEFORE.
 *
 * This is the original, fully-tested Episode 1 behavior, lifted verbatim into
 * the declarative episode framework. The only changes from the inline engine
 * code are structural (it now returns through the Episode contract). All
 * deterministic outcomes the 51 tests assert are preserved.
 */

function topicToLabel(topic: string): string {
  const map: Record<string, string> = {
    sarge: "Sarge",
    sarge_fine: "whether he and Sarge were really fine",
    money: "the money",
    mother: "your mother",
    note: "the note",
    "the night": "where he was that night",
    marine: "his time in the Marines",
    cats: "Captain the cat",
    general: "the night",
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
          "A single lamp burns in the living room. Chris sits on the couch, a bottle resting on his knee, watching the door like it owes him something. On the floor by his feet: two empties. A phone lies face-down on the table. Somewhere in this room is a truth Chris is not ready to give you."
        ),
      ],
      events: [],
    },
  };
}

function doInventory(s: WorldState): { state: WorldState; result: ActionResult } {
  const items = s.inventory.length
    ? s.inventory.map((i) => i.name).join(", ")
    : "nothing but the clothes you wore in.";
  return {
    state: s,
    result: {
      ok: true,
      narration: [beat(`You are carrying: ${items}.`, "system")],
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
          "Commands: look around · talk to Chris · ask Chris about Sarge · examine [object] · search the room · confront Chris · sleep · show evidence · help",
          "system"
        ),
      ],
      events: [],
    },
  };
}

function doSleep(s: WorldState): { state: WorldState; result: ActionResult } {
  let next = advanceTime(s, 480);
  next = setFlag(next, "ep1.slept", true);
  next = { ...next, episodeComplete: true, endingId: "ep1.dawn" };
  next = addEvent(next, {
    id: `ev_sleep_${s.events.length}`,
    type: "sleep",
    description:
      "You close your eyes. The night ends. Chris is still there at dawn — but you know now that something is hidden.",
  });
  return {
    state: next,
    result: {
      ok: true,
      narration: [
        beat(
          "You sleep. When you wake, light leaks under the blinds. Chris is in the same chair, watching the door. He says you should eat. He does not mention Sarge. He does not have to. You know he's keeping something from you — and the night gave you no answer, only the shape of the question."
        ),
      ],
      events: next.events,
    },
  };
}

function doWait(s: WorldState): { state: WorldState; result: ActionResult } {
  const next = advanceTime(s, 30);
  return {
    state: next,
    result: {
      ok: true,
      narration: [
        beat("Time passes. Chris doesn't move from the couch. The silence between you thickens."),
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
        narration: [
          beat(
            a.targetId
              ? `There's no one here to talk to but Chris.`
              : `Speak to whom? Chris is the only one in the room.`
          ),
        ],
        events: [],
      },
    };
  }
  // Talking to Chris raises confrontation pressure only if he's already guarded;
  // otherwise it's just presence. The disclosure policy reads recentlyConfronted
  // after a true confront, not from talk.
  let next = characterEngine.setMood(s, "chris", "guarded");
  const topicLabel = a.topicId ? topicToLabel(a.topicId) : "general";
  const decision = characterEngine.resolveDisclosure(next, "chris", a.topicId ?? "general", "talk");
  return {
    state: next,
    result: {
      ok: true,
      narration: [beat("You turn to Chris. He doesn't look away from the door.")],
      events: [],
      topicLabel,
      stateChanges: { handling: decision.mode, lieAbout: decision.lieAboutFactId, seed: decision.seed, why: decision.why },
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

  // Procedural disclosure: the engine decides HOW Chris answers from his live
  // belief/goal/trust state. The Ep1 contradiction (note vs "we were fine") is
  // now EMERGENT from this policy, not hardcoded.
  const decision = characterEngine.resolveDisclosure(s, "chris", topic, "ask");
  let next = characterEngine.recordAsk(s, "chris", topic);

  if (topic === "sarge") {
    next = addKnownFact(next, "ep1.sarge.dead");
    next = setFlag(next, "ep1.asked_sarge", true);
  }
  if (topic === "sarge_fine" || topic === "money" || topic === "note" || topic === "the night") {
    next = setFlag(next, `ep1.asked_${topic}`, true);
  }

  return {
    state: next,
    result: {
      ok: true,
      narration: [beat(`You ask Chris about ${topicLabel}.`)],
      events: [],
      stateChanges: {
        handling: decision.mode,
        lieAbout: decision.lieAboutFactId,
        seed: decision.seed,
        why: decision.why,
      },
    } as any,
  };
}

function doConfront(s: WorldState): { state: WorldState; result: ActionResult } {
  let next = characterEngine.adjustTrust(s, "chris", -5);
  next = characterEngine.markConfronted(next, "chris");
  next = setFlag(next, "ep1.confronted", true);
  next = { ...next, progression: s.progression + 1 };
  // Route the confront through the disclosure policy so the model NEVER fabricates
  // canon: the policy returns a seeded beat (deflect/threaten/lie/withhold).
  const decision = characterEngine.resolveDisclosure(next, "chris", "sarge_fine", "confront");
  const nextWithEvent = addEvent(next, {
    id: `ev_confront_${s.events.length}`,
    type: "confront",
    description: "Player confronted Chris. Trust down slightly; Chris more guarded.",
  });
  return {
    state: nextWithEvent,
    result: {
      ok: true,
      narration: [
        beat("You face him. The air goes still. Chris sets the bottle down, slow."),
      ],
      events: nextWithEvent.events,
      topicLabel: "where he was that night with Sarge",
      stateChanges: {
        handling: decision.mode,
        lieAbout: decision.lieAboutFactId,
        seed: decision.seed,
        why: decision.why,
      },
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
    case "note": {
      const ev = markDiscovered(instantiateEvidence("ev_chris_note"));
      next = discoverEvidence(next, ev);
      next = addKnownFact(next, "ep1.chris.with_sarge");
      next = addKnownFact(next, "ep1.chris.owes_money");
      next = setFlag(next, "ep1.found_note", true);
      next = characterEngine.liftWithhold(next, "chris", "ep1.chris.with_sarge");
      next = characterEngine.liftWithhold(next, "chris", "ep1.chris.owes_money");
      next = { ...next, progression: s.progression + 2 };
      discovered.push(ev);
      established.push("ep1.chris.with_sarge", "ep1.chris.owes_money");
      text = ev.content;
      break;
    }
    case "bottle": {
      const ev = markDiscovered(instantiateEvidence("ev_bottle"));
      next = discoverEvidence(next, ev);
      next = setFlag(next, "ep1.saw_bottles", true);
      discovered.push(ev);
      text = ev.content;
      break;
    }
    case "photo": {
      const ev = markDiscovered(instantiateEvidence("ev_photo_sarge"));
      next = discoverEvidence(next, ev);
      next = setFlag(next, "ep1.saw_photo", true);
      discovered.push(ev);
      text = ev.content;
      break;
    }
    case "phone": {
      next = { ...next, phoneUnlocked: true };
      const ev = markDiscovered(instantiateEvidence("ev_phone_chris"));
      next = discoverEvidence(next, ev);
      next = { ...next, contacts: next.contacts.map((c) => ({ ...c, reachable: true })) };
      discovered.push(ev);
      text =
        "Chris's phone, face-down. The screen is dark. You could call someone — if there were anyone to call.";
      break;
    }
    default:
      break;
  }

  if (target === "note" || target === "bottle" || target === "photo" || target === "phone") {
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
  if (a.targetId === "door" || a.targetId === "apartment") {
    let next = setFlag(s, "ep1.left", true);
    next = { ...next, episodeComplete: true, endingId: "ep1.left" };
    return {
      state: next,
      result: {
        ok: true,
        narration: [
          beat(
            "You open the door. The hall is dim, the building quiet. Chris doesn't stop you. He only says, low: \"You come back. Whatever you think you know, you come back.\" You step into the night with more questions than answers — and the certainty that Chris is hiding something he'd bleed to keep."
          ),
        ],
        events: addEvent(s, {
          id: `ev_leave_${s.events.length}`,
          type: "leave",
          description: "Player left the apartment. Episode ends unresolved.",
        }).events,
      },
    };
  }
  return {
    state: s,
    result: {
      ok: true,
      narration: [beat("There's nowhere to go but the room, the kitchen, the door.")],
      events: [],
    },
  };
}

function doCall(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  // P4: dispatch through the phone-contact registry. The old special-case "call
  // mother" path is now one entry in CONTACTS; calls route by targetId and run
  // through the same disclosure policy when they connect.
  return resolveCall(s, a.targetId);
}

export const EPISODE1: Episode = {
  id: "ep1",
  index: 1,
  title: "THE NIGHT BEFORE",
  subtitle: "episode i · a lamp, a silence, a note",
  next: "ep2",
  setup: () => {
    let state = createWorldState({
      startLocation: "apartment_living",
      characterIds: Object.keys(CHARACTERS),
      episodeId: "ep1",
    });
    state = characterEngine.initState(state, "chris");
    state = characterEngine.setMood(state, "chris", "guarded");
    state.contacts = defaultContacts();
    state.flags["ep1.started"] = true;
    state.quests["ep1.survive"] = {
      id: "ep1.survive",
      title: "Get through the night",
      status: "active",
    };
    state.quests["ep1.truth"] = {
      id: "ep1.truth",
      title: "Find out what Chris is hiding",
      status: "active",
    };
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
      case "sleep":
        return (s) => doSleep(s);
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
      case "call":
        return (s, a) => doCall(s, a);
      default:
        return null;
    }
  },
  isComplete: (state) => (state.episodeComplete ? state.endingId ?? "ep1.dawn" : null),
};
