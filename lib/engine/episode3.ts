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
import { resolveCall, contactsForEpisode } from "./contacts";

/**
 * EPISODE 3 — THE LAST CALL.
 *
 * Much later. Chris is failing. The player has built a life and a small
 * company; Chris is often alone. This episode resolves the long shadow of Ep1:
 * Chris finally tells the truth about Sarge (the debt collector), and the
 * player can catch him in the "I'm fine" lie via his medication. The episode
 * completes when the player either hears the truth or leaves him to his pride.
 *
 * Continuity: carries trust + evidence + known facts forward.
 */

function topicToLabel(topic: string): string {
  const map: Record<string, string> = {
    sarge: "Sarge",
    "the night": "that night / the debt",
    money: "the debt",
    health: "how he's doing",
    fine: "whether he's really fine",
    company: "your company",
    cats: "Captain the cat",
    general: "him",
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
          "Chris's place, late. He's smaller in the chair than he used to be. A glass of water on the table, a pill bottle beside it — he calls them vitamins. The phone rings sometimes; he lets it. A photo of the three of you sits face-out on the shelf. He pretends not to see you looking."
        ),
      ],
      events: [],
    },
  };
}

function doInventory(s: WorldState): { state: WorldState; result: ActionResult } {
  const carry = s.evidenceIds.length
    ? ` You still carry: ${s.evidenceIds.map((id) => getEvidenceDef(id as EvidenceId)?.title).filter(Boolean).join(", ")}.`
    : "";
  const items = s.inventory.length ? s.inventory.map((i) => i.name).join(", ") : "your phone, a wallet, the weight of a long year.";
  return {
    state: s,
    result: { ok: true, narration: [beat(`You are carrying: ${items}.${carry}`, "system")], events: [] },
  };
}

function doEvidence(s: WorldState): { state: WorldState; result: ActionResult } {
  const evs = s.evidenceIds.map((id) => getEvidenceDef(id as EvidenceId)?.title).filter(Boolean);
  const text = evs.length ? `Evidence you hold: ${evs.join("; ")}.` : "Nothing new recovered yet.";
  return { state: s, result: { ok: true, narration: [beat(text, "system")], events: [] } };
}

function doHelp(s: WorldState): { state: WorldState; result: ActionResult } {
  return {
    state: s,
    result: {
      ok: true,
      narration: [
        beat(
          "Commands: look around · talk to Chris · ask Chris about Sarge · ask Chris about the debt · examine the pills · confront Chris · sit with him · help",
          "system"
        ),
      ],
      events: [],
    },
  };
}

function doWait(s: WorldState): { state: WorldState; result: ActionResult } {
  const next = advanceTime(s, 45);
  return {
    state: next,
    result: { ok: true, narration: [beat("You sit. He breathes slow. The television flickers a show neither of you watches. He doesn't send you away.")], events: [] },
  };
}

function doTalk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId !== "chris") {
    return { state: s, result: { ok: true, narration: [beat("There's no one else in the room.")], events: [] } };
  }
  let next = characterEngine.setMood(s, "chris", "tired");
  const topicLabel = a.topicId ? topicToLabel(a.topicId) : "him";
  return {
    state: next,
    result: { ok: true, narration: [beat("You pull up a chair. He doesn't tell you to leave. Progress, of a kind.")], events: [], topicLabel } as any,
  };
}

function doAsk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId !== "chris") {
    return { state: s, result: { ok: false, reason: "There's no one here to ask but Chris.", narration: [], events: [] } };
  }
  const topic = a.topicId ?? "general";
  const topicLabel = topicToLabel(topic);
  const handling = characterEngine.resolveTopic(s, "chris", topic);

  let next = s;
  if (topic === "fine" || topic === "health") {
    next = addKnownFact(next, "ep3.chris.fine");
    next = setFlag(next, "ep3.asked_fine", true);
  }
  if (topic === "sarge" || topic === "money" || topic === "the night") {
    next = setFlag(next, `ep3.asked_${topic}`, true);
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
  let next = characterEngine.adjustTrust(s, "chris", -2);
  next = setFlag(next, "ep3.confronted", true);
  next = { ...next, progression: s.progression + 1 };
  // Pressing him hard enough, he finally tells the truth about Sarge.
  const ev = markDiscovered(instantiateEvidence("ev_chris_truth"));
  next = discoverEvidence(next, ev);
  next = addKnownFact(next, "ep3.chris.truth_sarge");
  const nextWithEvent = addEvent(next, {
    id: `ev_confront_${s.events.length}`,
    type: "confront",
    description: "Player pressed Chris about the truth. He told it: Sarge died because of Chris's debt.",
  });
  return {
    state: nextWithEvent,
    result: {
      ok: true,
      narration: [
        beat(
          "You press him. For a long moment he says nothing. Then, barely: \"...I was with Sarge because a man came collecting what I owed. Sarge stepped in front of it. He's dead because of my debt, kid. I never told you.\""
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
    case "pill":
    case "pills":
    case "bottle":
    case "medicine":
    case "medication": {
      const ev = markDiscovered(instantiateEvidence("ev_med_bottle"));
      next = discoverEvidence(next, ev);
      next = addKnownFact(next, "ep3.chris.fine");
      next = setFlag(next, "ep3.found_meds", true);
      next = characterEngine.liftWithhold(next, "chris", "ep3.chris.fine");
      next = { ...next, progression: s.progression + 2 };
      discovered.push(ev);
      established.push("ep3.chris.fine");
      text = ev.content;
      break;
    }
    case "photo":
    case "shelf": {
      next = setFlag(next, "ep3.saw_photo", true);
      text =
        "The photo: three figures on a porch. On the back, Chris's hand — 'the only family that counted.' He notices you looking and turns it face-down. Too late.";
      break;
    }
    case "phone": {
      next = setFlag(next, "ep3.phone_ringing", true);
      text =
        "The phone rings again. Chris glances at it, then at you, and lets it go to the quiet. 'Nobody I need,' he says. The screen goes dark.";
      break;
    }
    default:
      break;
  }

  if (["pill", "pills", "bottle", "medicine", "medication", "photo", "shelf", "phone"].includes(target ?? "")) {
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

function doSit(s: WorldState): { state: WorldState; result: ActionResult } {
  let next = characterEngine.adjustTrust(s, "chris", +3);
  next = setFlag(next, "ep3.sat_with_him", true);
  next = { ...next, progression: s.progression + 1 };
  const nextWithEvent = addEvent(next, {
    id: `ev_sit_${s.events.length}`,
    type: "comfort",
    description: "Player sat with Chris instead of pressing him.",
  });
  return {
    state: nextWithEvent,
    result: {
      ok: true,
      narration: [
        beat(
          "You don't ask anything. You just stay. After a while his hand finds the arm of your chair, a brief, rough pat. 'You turned out okay, kid.' It's the closest he'll come to saying it."
        ),
      ],
      events: nextWithEvent.events,
    } as any,
  };
}

function doMove(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId === "door" || a.targetId === "leave" || a.targetId === "go") {
    let next = setFlag(s, "ep3.left", true);
    next = { ...next, episodeComplete: true, endingId: "ep3.left" };
    return {
      state: next,
      result: {
        ok: true,
        narration: [
          beat(
            "You stand to go. Chris nods, the way he does — not goodbye, just 'I see you.' You leave him in the lamplight, the truth half-said between you. Some doors you don't close all the way."
          ),
        ],
        events: addEvent(s, { id: `ev_leave_${s.events.length}`, type: "leave", description: "Player left Chris's place." }).events,
      },
    };
  }
  return { state: s, result: { ok: true, narration: [beat("The chair, the photo, the door. That's the room.")], events: [] } };
}

export const EPISODE3: Episode = {
  id: "ep3",
  index: 3,
  title: "THE LAST CALL",
  subtitle: "episode iii · the debt, the pills, the half-truth",
  next: "ep4",
  setup: (carry?: WorldState) => {
    let state = createWorldState({
      startLocation: "chris_place",
      characterIds: Object.keys(CHARACTERS),
      episodeId: "ep3",
    });
    state = characterEngine.initState(state, "chris");
    state = characterEngine.setMood(state, "chris", "tired");
    if (carry) {
      const trust = carry.characterStates.chris?.trust ?? state.characterStates.chris.trust;
      state = {
        ...state,
        characterStates: {
          ...state.characterStates,
          chris: { ...state.characterStates.chris, trust, knowsFactIds: [...state.characterStates.chris.knowsFactIds] },
        },
        evidenceIds: [...carry.evidenceIds],
        knownFacts: [...new Set([...carry.knownFacts, ...state.knownFacts])],
      };
      // Live contacts for this episode (Mother reachable in Ep3 too).
      state = { ...state, contacts: contactsForEpisode("ep3") };
    }
    state.quests["ep3.truth"] = { id: "ep3.truth", title: "Get Chris to tell the truth about Sarge", status: "active" };
    state.quests["ep3.presence"] = { id: "ep3.presence", title: "Be with him, however he'll let you", status: "active" };
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
      case "call":
        return (s, a) => resolveCall(s, a.targetId);
      case "examine":
      case "search":
      case "use":
        return (s, a) => doExamine(s, a);
      case "move":
        return (s, a) => doMove(s, a);
      case "tell":
        // "sit with him" / "stay" — comfort action
        return (s) => doSit(s);
      default:
        return null;
    }
  },
  isComplete: (state) => (state.episodeComplete ? state.endingId ?? "ep3.left" : null),
};
