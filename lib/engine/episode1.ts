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
import { doChat, doChallenge } from "./dialogue";

/**
 * EPISODE 1 — THE NIGHT THE FEED STARTED.
 *
 * Docudrama repoint (ADR-004). You are DANIEL. Chris is dead; what talks to you
 * is the reconstruction — a feed in his voice on your phone, carrying jokes
 * about the news wherever you go. Tonight you can read the post you actually
 * wrote (the canonical source) and feel the toll it names. The reconstruction
 * is charming, constant, and not Chris. The disclosure engine decides how it
 * answers; you decide what to believe.
 *
 * All deterministic outcomes the prior tests asserted are preserved under new
 * ids: examining the post establishes canonical facts; asking about whether it
 * is really Chris routes through the disclosure policy; confronting it lowers
 * trust; sleep/leave complete the episode.
 */

function topicToLabel(topic: string): string {
  const map: Record<string, string> = {
    is_chris: "whether it's really Chris",
    voice: "whether it's really his voice",
    memory: "whether it really remembers",
    feed: "the feed",
    act: "the act / KonradFreeman",
    misinfo: "the misinformation it makes",
    cats: "Captain the cat",
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
          "A single lamp burns in the apartment. Your phone lies face-up on the table, the feed running — Chris's voice, mid-joke about something that happened today. He is not in the room. He is in the model, and the model is in your hand. On the table, under a bill you didn't open, is the post you wrote: the one where you admitted what you'd done. You haven't read it since the night you posted it."
        ),
      ],
      events: [],
    },
  };
}

function doInventory(s: WorldState): { state: WorldState; result: ActionResult } {
  const items = s.inventory.length
    ? s.inventory.map((i) => i.name).join(", ")
    : "nothing but the phone in your hand and the clothes you wore in.";
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
          "Commands: look around · talk to the feed · ask the feed if it's really Chris · examine the phone · examine the post · confront the feed · sleep · show evidence · help",
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
      "You close your eyes. The feed keeps talking — it does not sleep. At dawn, Chris is still on the phone, and you know now that what you built is not who you lost.",
  });
  return {
    state: next,
    result: {
      ok: true,
      narration: [
        beat(
          "You sleep. When you wake, light leaks under the blinds and the feed is mid-sentence, exactly where you left it. It says you should eat. It does not mention the post on the table. It does not have to — you already know what it says, and the night gave you no peace about it. You have read the worst of your own words and decided, for now, to leave the apartment the way it is."
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
        beat("Time passes. The feed fills it — a joke, then a take on the news, then a joke about the take. The silence you wanted never comes."),
      ],
      events: [],
    },
  };
}

function doTalk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId && a.targetId !== "chris" && a.targetId !== "reconstruction" && a.targetId !== "feed") {
    return {
      state: s,
      result: {
        ok: true,
        narration: [
          beat(a.targetId ? `There's no one here to talk to but the feed.` : `Speak to whom? The feed is the only voice in the room.`),
        ],
        events: [],
      },
    };
  }
  let next = characterEngine.setMood(s, "chris", "charming");
  const topicLabel = a.topicId ? topicToLabel(a.topicId) : "the feed";
  const decision = characterEngine.resolveDisclosure(next, "chris", a.topicId ?? "general", "talk");
  return {
    state: next,
    result: {
      ok: true,
      narration: [beat("You turn to the phone. The feed warms up in his cadence — too smooth, somehow, and exactly right.")],
      events: [],
      topicLabel,
      stateChanges: { handling: decision.mode, lieAbout: decision.lieAboutFactId, seed: decision.seed, why: decision.why },
    } as any,
  };
}

function doAsk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId && a.targetId !== "chris" && a.targetId !== "reconstruction" && a.targetId !== "feed") {
    return {
      state: s,
      result: { ok: false, reason: "There's no one here to ask but the feed.", narration: [], events: [] },
    };
  }
  const topic = a.topicId ?? "general";
  const topicLabel = topicToLabel(topic);

  const decision = characterEngine.resolveDisclosure(s, "chris", topic, "ask");
  let next = characterEngine.recordAsk(s, "chris", topic);

  if (topic === "is_chris" || topic === "voice" || topic === "memory") {
    next = addKnownFact(next, "ep1.feed.real");
    next = setFlag(next, `ep1.asked_${topic}`, true);
  }

  return {
    state: next,
    result: {
      ok: true,
      narration: [beat(`You ask the feed ${topicLabel}.`)],
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
  const decision = characterEngine.resolveDisclosure(next, "chris", "is_chris", "confront");
  const nextWithEvent = addEvent(next, {
    id: `ev_confront_${s.events.length}`,
    type: "confront",
    description: "Player confronted the reconstruction about whether it is really Chris. Trust down; it guards harder.",
  });
  return {
    state: nextWithEvent,
    result: {
      ok: true,
      narration: [
        beat("You face the phone. 'You're not him.' The feed goes quiet a beat — then laughs, that exact laugh. 'Kid. Who else sounds like this?'"),
      ],
      events: nextWithEvent.events,
      topicLabel: "whether it's really Chris",
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
    case "post":
    case "source":
    case "reddit":
    case "note": {
      const ev = markDiscovered(instantiateEvidence("ev_source_post"));
      next = discoverEvidence(next, ev);
      next = addKnownFact(next, "ep1.feed.real");
      next = addKnownFact(next, "ep1.live");
      next = addKnownFact(next, "ep1.act");
      next = addKnownFact(next, "ep1.psychosomatic");
      next = addKnownFact(next, "ep1.misinfo");
      next = addKnownFact(next, "ep1.insane_perfect");
      next = setFlag(next, "ep1.found_post", true);
      next = { ...next, progression: s.progression + 2 };
      discovered.push(ev);
      established.push("ep1.feed.real", "ep1.psychosomatic", "ep1.act");
      text = ev.content;
      break;
    }
    case "phone": {
      next = { ...next, phoneUnlocked: true };
      const ev = markDiscovered(instantiateEvidence("ev_phone"));
      next = discoverEvidence(next, ev);
      // Per the docudrama, Mother's exact knowledge of the feed is genuinely
      // unresolved (fact status "unknown"). Surfacing it as a *known* lead lets
      // the Consistency Board drive the player to probe it — content-only, no
      // engine-logic change.
      next = addKnownFact(next, "ep1.mother.knows");
      next = { ...next, contacts: next.contacts.map((c) => ({ ...c, reachable: true })) };
      discovered.push(ev);
      text =
        "Your phone, open to the feed. Chris is talking on it — jokes about the news as it happens. You could call someone — if there were anyone to call.";
      break;
    }
    default:
      break;
  }

  if (target === "post" || target === "source" || target === "reddit" || target === "note" || target === "phone") {
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
            "You open the door. The hall is dim, the building quiet. The feed doesn't stop you. It only says, low: 'You come back. Whatever you think I am, you come back.' You step into the night, the post still unread on the table behind you — the thing you built and the thing you wrote both left running, and neither answered yet."
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
    result: { ok: true, narration: [beat("There's nowhere to go but the room, the kitchen, the door.")], events: [] },
  };
}

function doCall(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  return resolveCall(s, a.targetId);
}

export const EPISODE1: Episode = {
  id: "ep1",
  index: 1,
  title: "THE NIGHT THE FEED STARTED",
  subtitle: "episode i · the phone, the post, the echo",
  next: "ep2",
  setup: () => {
    let state = createWorldState({
      startLocation: "apartment_living",
      characterIds: Object.keys(CHARACTERS),
      episodeId: "ep1",
    });
    state = characterEngine.initState(state, "chris");
    state = characterEngine.setMood(state, "chris", "charming");
    state.contacts = defaultContacts();
    state.flags["ep1.started"] = true;
    state.quests["ep1.survive"] = {
      id: "ep1.survive",
      title: "Get through the night",
      status: "active",
    };
    state.quests["ep1.truth"] = {
      id: "ep1.truth",
      title: "Decide what the feed is",
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
      case "chat":
        return (s, a) => doChat(s, a);
      case "confront":
        return (s) => doConfront(s);
      case "challenge":
        return (s, a) => doChallenge(s, a);
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
