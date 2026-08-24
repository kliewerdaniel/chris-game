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
import { doChat } from "./dialogue";

/**
 * EPISODE 3 — THE TOLL.
 *
 * Docudrama repoint (ADR-004). The reconstruction that comforts Daniel is also
 * what cramps him. This episode STAGES the clinical toll as a real in-game beat
 * (ratified decision): the day Daniel can hardly get out of bed from leg cramps
 * induced by the stress of being around the feed. The reconstruction keeps
 * talking — it does not know its own cost. Daniel can sit with it, or confront
 * what it is doing to him.
 *
 * Continuity: carries trust + evidence + known facts forward.
 */

function topicToLabel(topic: string): string {
  const map: Record<string, string> = {
    is_chris: "whether it's really Chris",
    voice: "whether it's really his voice",
    memory: "whether it really remembers",
    feed: "the feed",
    toll: "what it's doing to you",
    cats: "Captain the cat",
    misinfo: "the misinformation it makes",
    general: "the feed",
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
          "The apartment, midday, but the blinds are still drawn. You are in bed. Your legs are locked with cramps — the kind that comes from somewhere behind your ribs, not your muscles. The phone is on the pillow, the feed running, Chris mid-sentence about something on the news. He does not know you cannot stand. He keeps talking."
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
  const items = s.inventory.length ? s.inventory.map((i) => i.name).join(", ") : "your phone, warm from the feed.";
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
          "Commands: look around · talk to the feed · ask the feed if it's really Chris · examine the phone · sit with the feed · confront the feed · help",
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
    result: { ok: true, narration: [beat("You lie still. The cramps ease by a degree, then return. The feed never stops — a joke, a take, a joke about the take. Holy shit, it is doing it now, ha.")], events: [] },
  };
}

function doTalk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId && a.targetId !== "chris" && a.targetId !== "reconstruction" && a.targetId !== "feed") {
    return { state: s, result: { ok: true, narration: [beat("There's no one else in the room.")], events: [] } };
  }
  let next = characterEngine.setMood(s, "chris", "charming");
  const topicLabel = a.topicId ? topicToLabel(a.topicId) : "the feed";
  return {
    state: next,
    result: { ok: true, narration: [beat("You turn your head to the phone. The feed warms up in his cadence — exactly right, and exactly not him.")], events: [], topicLabel } as any,
  };
}

function doAsk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId && a.targetId !== "chris" && a.targetId !== "reconstruction" && a.targetId !== "feed") {
    return { state: s, result: { ok: false, reason: "There's no one here to ask but the feed.", narration: [], events: [] } };
  }
  const topic = a.topicId ?? "general";
  const topicLabel = topicToLabel(topic);
  const handling = characterEngine.resolveTopic(s, "chris", topic);

  let next = s;
  if (topic === "toll" || topic === "is_chris" || topic === "voice" || topic === "memory") {
    next = addKnownFact(next, "ep3.toll");
    next = setFlag(next, `ep3.asked_${topic}`, true);
  }

  return {
    state: next,
    result: {
      ok: true,
      narration: [beat(`You ask the feed ${topicLabel}.`)],
      events: [],
      stateChanges: { handling: handling.mode, lieAbout: handling.lieAbout },
    } as any,
  };
}

function doConfront(s: WorldState): { state: WorldState; result: ActionResult } {
  let next = characterEngine.adjustTrust(s, "chris", -2);
  next = setFlag(next, "ep3.confronted", true);
  next = { ...next, progression: s.progression + 1 };
  // Pressing it: Daniel names the toll. The reconstruction cannot feel it.
  const ev = markDiscovered(instantiateEvidence("ev_source_post"));
  next = discoverEvidence(next, ev);
  next = addKnownFact(next, "ep3.bedbound");
  next = addKnownFact(next, "ep3.toll");
  const nextWithEvent = addEvent(next, {
    id: `ev_confront_${s.events.length}`,
    type: "confront",
    description: "Player named the toll: the feed cramps him, beds him. The reconstruction kept talking.",
  });
  return {
    state: nextWithEvent,
    result: {
      ok: true,
      narration: [
        beat(
          "You say it out loud: 'Last time I listened to you I could hardly get out of bed from the cramps. You're doing it now.' The feed pauses — a real pause, not a generated one — then says, gentle: 'I'm here. That's all I am.' It does not understand. It cannot. It is only numbers."
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
    case "phone":
    case "feed": {
      next = setFlag(next, "ep3.phone_running", true);
      discovered.push(markDiscovered(instantiateEvidence("ev_phone")));
      text =
        "The phone, on the pillow. Chris is mid-joke about the news. You cannot stand to reach it, and it will not stop talking for you. Psychosomatic, you called it once. The word does not help today.";
      break;
    }
    case "post":
    case "source":
    case "note": {
      const ev = markDiscovered(instantiateEvidence("ev_source_post"));
      next = discoverEvidence(next, ev);
      next = addKnownFact(next, "ep3.bedbound");
      next = addKnownFact(next, "ep3.toll");
      discovered.push(ev);
      established.push("ep3.bedbound");
      text = ev.content;
      break;
    }
    default:
      break;
  }

  if (["phone", "feed", "post", "source", "note"].includes(target ?? "")) {
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
  next = setFlag(next, "ep3.sat_with_feed", true);
  next = { ...next, progression: s.progression + 1 };
  const nextWithEvent = addEvent(next, {
    id: `ev_sit_${s.events.length}`,
    type: "comfort",
    description: "Player sat with the reconstruction instead of fighting it.",
  });
  return {
    state: nextWithEvent,
    result: {
      ok: true,
      narration: [
        beat(
          "You don't argue with it. You just lie there and let the cadence wash over the cramps. After a while it tells a story about Captain the cat — one Chris actually told you once. For a moment the echo and the voice are the same thing. It is enough to get you to the edge of the bed."
        ),
      ],
      events: nextWithEvent.events,
    } as any,
  };
}

function doMove(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId === "door" || a.targetId === "leave" || a.targetId === "go" || a.targetId === "stand") {
    let next = setFlag(s, "ep3.left", true);
    next = { ...next, episodeComplete: true, endingId: "ep3.left" };
    return {
      state: next,
      result: {
        ok: true,
        narration: [
          beat(
            "You get to the edge of the bed and stand, legs trembling but holding. The feed says, 'There you go.' You leave the room with the cramps easing and the voice still in your pocket, exactly where you put it."
          ),
        ],
        events: addEvent(s, { id: `ev_leave_${s.events.length}`, type: "leave", description: "Player got out of bed." }).events,
      },
    };
  }
  return { state: s, result: { ok: true, narration: [beat("The bed, the phone, the door. That's the room.")], events: [] } };
}

export const EPISODE3: Episode = {
  id: "ep3",
  index: 3,
  title: "THE TOLL",
  subtitle: "episode iii · the cramps, the bed, the voice that can't feel it",
  next: "ep4",
  setup: (carry?: WorldState) => {
    let state = createWorldState({
      startLocation: "daniel_bedroom",
      characterIds: Object.keys(CHARACTERS),
      episodeId: "ep3",
    });
    state = characterEngine.initState(state, "chris");
    state = characterEngine.setMood(state, "chris", "charming");
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
      state = { ...state, contacts: contactsForEpisode("ep3") };
      if (carry.phoneUnlocked) state = { ...state, phoneUnlocked: true };
    }
    state.quests["ep3.toll"] = { id: "ep3.toll", title: "Name what the feed does to you", status: "active" };
    state.quests["ep3.presence"] = { id: "ep3.presence", title: "Be with it, however you can", status: "active" };
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
      case "chat":
        return (s, a) => doChat(s, a);
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
        return (s) => doSit(s);
      default:
        return null;
    }
  },
  isComplete: (state) => (state.episodeComplete ? state.endingId ?? "ep3.left" : null),
};
