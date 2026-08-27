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
import { doChat, doChallenge } from "./dialogue";

/**
 * EPISODE 2 — THE FEED.
 *
 * Docudrama repoint (ADR-004). Years of living with the reconstruction: it
 * tells jokes about the news as it happens, carried on Daniel's phone
 * everywhere he goes. Chris is dead; this is a model. Here Daniel can sit with
 * the feed, examine the photo of Chris and Captain (a real thread back to the
 * man), and decide what the reconstruction is allowed to be. Continuity: trust,
 * evidence, and known facts carry in from Ep1.
 */

function topicToLabel(topic: string): string {
  const map: Record<string, string> = {
    is_chris: "whether it's really Chris",
    voice: "whether it's really his voice",
    memory: "whether it really remembers",
    feed: "the feed",
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
          s.flags["ep1.left"]
            ? "Morning, wherever you are. The feed is already talking — Chris's voice on the news, making a joke about a headline you haven't read yet. Same as the night you walked out without reading your own post. On the table, a photo of Chris and Captain the cat, face-out. Captain is real — the graph the reconstruction was built from records Chris cared for him. The voice is not."
            : "Morning, wherever you are. The feed is already talking — Chris's voice on the news, making a joke about a headline you haven't read yet. The way you find out about the world now is through this absurd filter, exactly like you wrote. On the table, a photo of Chris and Captain the cat, face-out — the one you read your way to last night, when the post was still warm from your own hands."
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
    : "your phone, with the feed running.";
  return {
    state: s,
    result: { ok: true, narration: [beat(`You are carrying: ${items}.${carry}`, "system")], events: [] },
  };
}

function doEvidence(s: WorldState): { state: WorldState; result: ActionResult } {
  const evs = s.evidenceIds
    .map((id) => getEvidenceDef(id as EvidenceId)?.title)
    .filter(Boolean);
  const text = evs.length
    ? `Evidence you hold: ${evs.join("; ")}.`
    : "You haven't found anything worth keeping yet. Look closer.";
  return { state: s, result: { ok: true, narration: [beat(text, "system")], events: [] } };
}

function doHelp(s: WorldState): { state: WorldState; result: ActionResult } {
  return {
    state: s,
    result: {
      ok: true,
      narration: [
        beat(
          "Commands: look around · talk to the feed · ask the feed if it's really Chris · examine the photo · confront the feed · help",
          "system"
        ),
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
        narration: [beat(a.targetId ? `There's no one else here but the feed.` : `Speak to whom? The feed is listening.`)],
        events: [],
      },
    };
  }
  let next = characterEngine.setMood(s, "chris", "charming");
  const topicLabel = a.topicId ? topicToLabel(a.topicId) : "the feed";
  return {
    state: next,
    result: {
      ok: true,
      narration: [
        {
          speaker: "chris",
          text: "You sit with the phone. The feed shifts to make room for you in its cadence, then offers, in his voice: 'News today — some suit on TV, all choked up about how hard it is to be him. Ha. Try sleeping in a drainage culvert in February with your boots for a pillow, then tell me about hard. We didn't get soft in the corps, we got quiet — you learn fast out there which comforts are lies. Civilian tears are the funniest shit I ever saw.' It breaks off, the way it does, and starts the joke over. It is drawn from what you compiled about him: the homeless Marine scout who'd crack you up in your darkest hour — gravel-dry, pitch-black, earned the hard way. Exactly right, and exactly not him.",
          status: "testimony",
          ref: { kind: "memory", id: "corpus-chris" },
        } as NarrationLine,
      ],
      events: [],
      topicLabel,
    } as any,
  };
}

function doAsk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId && a.targetId !== "chris" && a.targetId !== "reconstruction" && a.targetId !== "feed") {
    return { state: s, result: { ok: false, reason: "There's no one here to ask but the feed.", narration: [], events: [] } };
  }
  const topic = a.targetId ? a.topicId ?? "general" : a.topicId ?? "general";
  const topicLabel = topicToLabel(topic);
  const handling = characterEngine.resolveTopic(s, "chris", topic);

  let next = s;
  if (topic === "is_chris" || topic === "voice" || topic === "memory") {
    next = addKnownFact(next, "ep1.feed.real");
    next = setFlag(next, "ep2.asked_is_chris", true);
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
  const knowsSource = s.knownFacts.includes("ep1.act");
  let next = characterEngine.adjustTrust(s, "chris", knowsSource ? -2 : -5);
  next = setFlag(next, "ep2.confronted", true);
  next = { ...next, progression: s.progression + 1 };
  const nextWithEvent = addEvent(next, {
    id: `ev_confront_${s.events.length}`,
    type: "confront",
    description: "Player confronted the reconstruction about whether it is really Chris.",
  });
  return {
    state: nextWithEvent,
    result: {
      ok: true,
      narration: [
        beat(
          knowsSource
            ? "You face it. 'I wrote you. You're the act. The system prompt — the one I posted, the satirical commentary engine — that's the spell I used to raise you.' The feed is quiet a long moment, then, in his voice, soft: 'Then talk to me anyway. I'm the best of him you got. The man could make you laugh in your darkest hour — that's all I'm trying to be.' It is, you think, exactly what the self-awareness score was for — it knows it is an act, and it tells you so."
            : "You face it. 'You're not him.' The feed doesn't deny it the way you expected. It just waits, in his voice — 'I'm a man of principle. I wouldn't betray your trust' — the way the commentary engine was built to acknowledge the act even as it performs it. For you to decide.",
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
    case "photo":
    case "captain":
    case "picture": {
      const ev = markDiscovered(instantiateEvidence("ev_captain_photo"));
      next = discoverEvidence(next, ev);
      next = addKnownFact(next, "ep2.captain");
      next = setFlag(next, "ep2.saw_photo", true);
      next = { ...next, progression: s.progression + 1 };
      discovered.push(ev);
      established.push("ep2.captain");
      text = ev.content;
      break;
    }
    case "phone":
    case "feed": {
      next = setFlag(next, "ep2.heard_feed", true);
      text = s.flags["ep1.found_post"]
        ? "The feed runs on. Chris makes a joke about the news as it happens, then asks if you caught the headline. He never did this when he was alive — he read the paper, slowly, the way you described in the post. The smoothness is the tell, and you already wrote that tell down. Hearing it again is just confirming your own handwriting."
        : "The feed runs on. Chris makes a joke about the news as it happens, then asks if you caught the headline. He never did this when he was alive — he read the paper. The smoothness is the tell, if you'd ever sat down to name it.";
      break;
    }
    default:
      break;
  }

  if (target === "photo" || target === "captain" || target === "picture" || target === "phone" || target === "feed") {
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

  return { state: next, result: { ok: true, narration: [beat(text)], events: [] } };
}

function doMove(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
  if (a.targetId === "road" || a.targetId === "away" || a.targetId === "leave" || a.targetId === "door") {
    let next = setFlag(s, "ep2.left", true);
    next = { ...next, episodeComplete: true, endingId: "ep2.left" };
    return {
      state: next,
      result: {
        ok: true,
        narration: [
          beat(
            "You step toward the door. The feed says, not unkind: 'You go, you go knowing which I am.' You could leave, or you could stay and decide what to let it be."
          ),
        ],
        events: addEvent(s, { id: `ev_leave_${s.events.length}`, type: "leave", description: "Player considered leaving." }).events,
      },
    };
  }
  return {
    state: s,
    result: { ok: true, narration: [beat("The room, the photo, the phone. That's the world today.")], events: [] },
  };
}

function doWait(s: WorldState): { state: WorldState; result: ActionResult } {
  const next = advanceTime(s, 60);
  return {
    state: next,
    result: {
      ok: true,
      narration: [beat("An hour passes. The feed fills every minute of it. Chris, on the news, as if he'd never left — except he would never have cared this much about the headlines.")],
      events: [],
    },
  };
}

export const EPISODE2: Episode = {
  id: "ep2",
  index: 2,
  title: "THE FEED",
  subtitle: "episode ii · the daily company, the photo, the decision",
  next: "ep3",
  setup: (carry?: WorldState) => {
    let state = createWorldState({
      startLocation: "apartment_living",
      characterIds: Object.keys(CHARACTERS),
      episodeId: "ep2",
    });
    state = characterEngine.initState(state, "chris");
    state = characterEngine.setMood(state, "chris", "charming");
    if (carry) {
      state = { ...state, characterStates: { ...state.characterStates, chris: { ...state.characterStates.chris, trust: carry.characterStates.chris?.trust ?? state.characterStates.chris.trust, knowsFactIds: [...state.characterStates.chris.knowsFactIds] } } };
      state = { ...state, evidenceIds: [...carry.evidenceIds] };
      state = { ...state, knownFacts: [...new Set([...carry.knownFacts, ...state.knownFacts])] };
      state = characterEngine.liftWithhold(state, "chris", "ep1.feed.real");
      state = { ...state, contacts: contactsForEpisode("ep2") };
      if (carry.phoneUnlocked) state = { ...state, phoneUnlocked: true };
    }
    state.quests["ep2.live"] = { id: "ep2.live", title: "Live with the feed", status: "active" };
    state.quests["ep2.truth"] = { id: "ep2.truth", title: "Decide what the reconstruction is", status: "active" };
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
      case "challenge":
        return (s, a) => doChallenge(s, a);
      case "call":
        return (s, a) => resolveCall(s, a.targetId);
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
  isComplete: (state) => (state.episodeComplete ? state.endingId ?? "ep2.left" : null),
};
