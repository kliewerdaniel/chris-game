import { WorldState, GameAction, ActionResult, NarrationLine, EvidenceId } from "../core/types";
import {
  createWorldState,
  advanceTime,
  addEvent,
  discoverEvidence,
  setFlag,
  addKnownFact,
} from "../core/world";
import { FACTS } from "../core/facts";
import { instantiateEvidence, markDiscovered, getEvidenceDef } from "../core/evidence";
import { CharacterEngine, characterEngine } from "../characters/engine";
import { CHRIS, CHARACTERS } from "../characters/chris";
import { Retrieval, buildRetrievalFromMemories } from "../retrieval/retrieval";
import { Narrator } from "../narrative/narrator";
import { InferenceManager } from "../inference/provider";
import { parseAction, isConfident } from "../inference/intent";

export interface EngineDeps {
  retrieval: Retrieval;
  narrator: Narrator;
  inference: InferenceManager;
  characterEngine?: CharacterEngine;
}

/**
 * The deterministic engine. Owns all state transitions. The LLM is invoked only
 * through the Narrator, which returns prose that the engine NEVER trusts to
 * mutate state. Any state change here is explicit and rule-driven.
 */
export class GameEngine {
  private ce: CharacterEngine;
  constructor(private deps: EngineDeps) {
    this.ce = deps.characterEngine ?? characterEngine;
  }

  /** Start a fresh Episode 1 playthrough. */
  newGame(): WorldState {
    let state = createWorldState({
      startLocation: "apartment_living",
      characterIds: Object.keys(CHARACTERS),
    });
    // Chris begins in the room, guarded.
    state = this.ce.initState(state, "chris");
    state = this.ce.setMood(state, "chris", "guarded");
    // phone starts locked; Chris's contact is known once unlocked.
    state.contacts = [{ id: "chris_phone", name: "Chris", phoneNumber: "—", reachable: false }];
    state.flags["ep1.started"] = true;
    state.quests["ep1.survive"] = { id: "ep1.survive", title: "Get through the night", status: "active" };
    state.quests["ep1.truth"] = { id: "ep1.truth", title: "Find out what Chris is hiding", status: "active" };
    return state;
  }

  /**
   * Process a player turn. This is the full runtime pipeline:
   *   input → parse → validate → (retrieval) → (character) → (evidence)
   *        → narration → OUTPUT VALIDATION → (state transition) → save
   */
  async processTurn(state: WorldState, raw: string): Promise<{ state: WorldState; result: ActionResult }> {
    const action = parseAction(raw);

    // 1. Validate confidence / reachability deterministically.
    if (!isConfident(action)) {
      return {
        state,
        result: {
          ok: false,
          reason: "I didn't catch that. Try 'look around', 'talk to Chris', or 'ask Chris about Sarge'.",
          narration: [],
          events: [],
        },
      };
    }

    // 2. Dispatch by verb. Each handler is deterministic and returns a result.
    const handler = this.dispatch(action);
    let { state: next, result } = handler(state, action);

    // 3. If the handler succeeded, voice character turns (talk/ask/confront)
    //    and, as a safety net, fill any other empty narration.
    if (result.ok) {
      const needsVoice = ["talk", "ask", "confront"].includes(action.type);
      if (needsVoice || result.narration.length === 0) {
        const nar = await this.generateNarration(next, action, result);
        result = { ...result, narration: nar };
      }
    }

    return { state: next, result };
  }

  private dispatch(action: GameAction): (s: WorldState, a: GameAction) => { state: WorldState; result: ActionResult } {
    switch (action.type) {
      case "look":
        return (s) => this.doLook(s);
      case "inventory":
        return (s) => this.doInventory(s);
      case "evidence":
        return (s) => this.doEvidence(s);
      case "help":
        return (s) => this.doHelp(s);
      case "sleep":
        return (s) => this.doSleep(s);
      case "wait":
        return (s) => this.doWait(s);
      case "talk":
        return (s, a) => this.doTalk(s, a);
      case "ask":
        return (s, a) => this.doAsk(s, a);
      case "confront":
        return (s, a) => this.doConfront(s, a);
      case "examine":
      case "search":
      case "use":
        return (s, a) => this.doExamine(s, a);
      case "move":
        return (s, a) => this.doMove(s, a);
      case "call":
        return (s, a) => this.doCall(s, a);
      case "unknown":
        return (s) => ({ state: s, result: { ok: false, reason: "I didn't catch that. Try 'look around', 'talk to Chris', or 'ask Chris about Sarge'.", narration: [], events: [] } });
      default:
        return (s) => ({ state: s, result: { ok: false, reason: "You can't do that.", narration: [], events: [] } });
    }
  }

  // ---- handlers (all deterministic) ----

  private doLook(s: WorldState): { state: WorldState; result: ActionResult } {
    const lines: NarrationLine[] = [
      {
        speaker: "narrator",
        text:
          "A single lamp burns in the living room. Chris sits on the couch, a bottle resting on his knee, watching the door like it owes him something. On the floor by his feet: two empties. A phone lies face-down on the table. Somewhere in this room is a truth Chris is not ready to give you.",
        status: "canonical",
      },
    ];
    return { state: s, result: { ok: true, narration: lines, events: [] } };
  }

  private doInventory(s: WorldState): { state: WorldState; result: ActionResult } {
    const items = s.inventory.length
      ? s.inventory.map((i) => i.name).join(", ")
      : "nothing but the clothes you wore in.";
    return {
      state: s,
      result: {
        ok: true,
        narration: [{ speaker: "system", text: `You are carrying: ${items}.`, status: "canonical" }],
        events: [],
      },
    };
  }

  private doEvidence(s: WorldState): { state: WorldState; result: ActionResult } {
    const evs = s.evidenceIds.map((id) => getEvidenceDef(id as EvidenceId)?.title).filter(Boolean);
    const text = evs.length
      ? `Evidence you hold: ${evs.join("; ")}.`
      : "You haven't found anything worth keeping yet. Look closer.";
    return {
      state: s,
      result: { ok: true, narration: [{ speaker: "system", text, status: "canonical" }], events: [] },
    };
  }

  private doHelp(s: WorldState): { state: WorldState; result: ActionResult } {
    return {
      state: s,
      result: {
        ok: true,
        narration: [
          {
            speaker: "system",
            text:
              "Commands: look around · talk to Chris · ask Chris about Sarge · examine [object] · search the room · confront Chris · sleep · show evidence · help",
            status: "canonical",
          },
        ],
        events: [],
      },
    };
  }

  private doSleep(s: WorldState): { state: WorldState; result: ActionResult } {
    let next = advanceTime(s, 480);
    next = setFlag(next, "ep1.slept", true);
    next = { ...next, episodeComplete: true, endingId: "ep1.dawn" };
    next = addEvent(next, { id: `ev_sleep_${s.events.length}`, type: "sleep", description: "You close your eyes. The night ends. Chris is still there at dawn — but you know now that something is hidden." });
    return {
      state: next,
      result: {
        ok: true,
        narration: [
          {
            speaker: "narrator",
            text:
              "You sleep. When you wake, light leaks under the blinds. Chris is in the same chair, watching the door. He says you should eat. He does not mention Sarge. He does not have to. You know he's keeping something from you — and the night gave you no answer, only the shape of the question.",
            status: "canonical",
          },
        ],
        events: next.events,
      },
    };
  }

  private doWait(s: WorldState): { state: WorldState; result: ActionResult } {
    const next = advanceTime(s, 30);
    return {
      state: next,
      result: {
        ok: true,
        narration: [{ speaker: "narrator", text: "Time passes. Chris doesn't move from the couch. The silence between you thickens.", status: "canonical" }],
        events: [],
      },
    };
  }

  private doTalk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
    if (a.targetId !== "chris") {
      return {
        state: s,
        result: {
          ok: true,
          narration: [{ speaker: "narrator", text: a.targetId ? `There's no one here to talk to but Chris.` : `Speak to whom? Chris is the only one in the room.`, status: "canonical" }],
          events: [],
        },
      };
    }
    // Talking without a topic → smalltalk; may surface a guarded mood beat.
    let next = this.ce.setMood(s, "chris", "guarded");
    const topicLabel = a.topicId ? topicToLabel(a.topicId) : "general";
    const lines: NarrationLine[] = [
      { speaker: "narrator", text: "You turn to Chris. He doesn't look away from the door.", status: "canonical" },
    ];
    return {
      state: next,
      result: { ok: true, narration: lines, events: [], topicLabel: topicLabel } as any,
    };
  }

  private doAsk(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
    if (a.targetId !== "chris") {
      return { state: s, result: { ok: false, reason: "There's no one here to ask but Chris.", narration: [], events: [] } };
    }
    const topic = a.topicId ?? "general";
    const topicLabel = topicToLabel(topic);
    const handling = this.ce.resolveTopic(s, "chris", topic);

    // Track the question as a hypothesis/belief seed if contradictory.
    let next = s;
    if (topic === "sarge") {
      next = addKnownFact(next, "ep1.sarge.dead");
      next = setFlag(next, "ep1.asked_sarge", true);
    }
    if (topic === "sarge_fine" || topic === "money" || topic === "note" || topic === "the night") {
      next = setFlag(next, `ep1.asked_${topic}`, true);
    }

    const lines: NarrationLine[] = [
      { speaker: "narrator", text: `You ask Chris about ${topicLabel}.`, status: "canonical" },
    ];
    return {
      state: next,
      result: {
        ok: true,
        narration: lines,
        events: [],
        // the engine records the deterministic handling; narrator will voice it.
        stateChanges: { handling: handling.mode, lieAbout: handling.lieAbout },
      } as any,
    };
  }

  private doConfront(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
    let next = this.ce.adjustTrust(s, "chris", -5);
    next = setFlag(next, "ep1.confronted", true);
    next = { ...next, progression: s.progression + 1 };
    const lines: NarrationLine[] = [
      { speaker: "narrator", text: "You face him. The air goes still. Chris sets the bottle down, slow.", status: "canonical" },
    ];
    const nextWithEvent = addEvent(next, {
      id: `ev_confront_${s.events.length}`,
      type: "confront",
      description: "Player confronted Chris. Trust down slightly; Chris more guarded.",
    });
    return {
      state: nextWithEvent,
      result: {
        ok: true,
        narration: lines,
        events: nextWithEvent.events,
        // the narrator will voice a withhold; if the player has the note, a
        // contradiction will be surfaced by the evidence check below.
      } as any,
    };
  }

  private doExamine(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
    const target = a.targetId;
    let next = s;
    const discovered: any[] = [];
    const established: string[] = [];
    let text = "You don't see that here.";

    switch (target) {
      case "note": {
        // THE DISCOVERY: the crumpled note revealing Chris was with Sarge.
        const ev = markDiscovered(instantiateEvidence("ev_chris_note"));
        next = discoverEvidence(next, ev);
        next = addKnownFact(next, "ep1.chris.with_sarge");
        next = addKnownFact(next, "ep1.chris.owes_money");
        next = setFlag(next, "ep1.found_note", true);
        next = this.ce.liftWithhold(next, "chris", "ep1.chris.with_sarge");
        next = this.ce.liftWithhold(next, "chris", "ep1.chris.owes_money");
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
        text = "Chris's phone, face-down. The screen is dark. You could call someone — if there were anyone to call.";
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
          narration: [{ speaker: "evidence", text, status: "canonical", ref: { kind: "evidence", id: discovered[0]?.id ?? "" } }],
          events: [],
          discoveredEvidence: discovered,
          establishedFacts: established,
        },
      };
    }

    return { state: next, result: { ok: true, narration: [{ speaker: "narrator", text, status: "canonical" }], events: [] } };
  }

  private doMove(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
    if (a.targetId === "door" || a.targetId === "apartment") {
      let next = setFlag(s, "ep1.left", true);
      next = { ...next, episodeComplete: true, endingId: "ep1.left" };
      return {
        state: next,
        result: {
          ok: true,
          narration: [
            {
              speaker: "narrator",
              text:
                "You open the door. The hall is dim, the building quiet. Chris doesn't stop you. He only says, low: \"You come back. Whatever you think you know, you come back.\" You step into the night with more questions than answers — and the certainty that Chris is hiding something he'd bleed to keep.",
              status: "canonical",
            },
          ],
          events: addEvent(s, { id: `ev_leave_${s.events.length}`, type: "leave", description: "Player left the apartment. Episode ends unresolved." }).events,
        },
      };
    }
    return { state: s, result: { ok: true, narration: [{ speaker: "narrator", text: "There's nowhere to go but the room, the kitchen, the door.", status: "canonical" }], events: [] } };
  }

  private doCall(s: WorldState, a: GameAction): { state: WorldState; result: ActionResult } {
    if (!s.phoneUnlocked) {
      return { state: s, result: { ok: false, reason: "The phone is face-down on the table. You haven't picked it up.", narration: [], events: [] } };
    }
    if (a.targetId === "mother") {
      const nextWithEvent = addEvent(s, {
        id: `ev_call_mom_${s.events.length}`,
        type: "call",
        description: "Player called Mother; no answer.",
      });
      return {
        state: nextWithEvent,
        result: {
          ok: true,
          narration: [
            { speaker: "narrator", text: "You dial Mother. It rings. And rings. No answer — only the knowledge that she's unwell, and that this call can wait. Or can't.", status: "canonical" },
          ],
          events: nextWithEvent.events,
        },
      };
    }
    return {
      state: s,
      result: { ok: true, narration: [{ speaker: "narrator", text: "No one else to call. Just Chris, sitting in the lamplight.", status: "canonical" }], events: [] },
    };
  }

  /** After a handler, generate model narration for character turns. */
  private async generateNarration(
    state: WorldState,
    action: GameAction,
    result: ActionResult
  ): Promise<NarrationLine[]> {
    const handling = (result.stateChanges as any)?.handling as
      | "truth"
      | "lie"
      | "withhold"
      | "unknown"
      | undefined;
    const lieAbout = (result.stateChanges as any)?.lieAbout as string | undefined;
    const topicLabel = (result as any).topicLabel as string | undefined;

    // Character-voiced turns only for talk/ask/confront.
    if (!["talk", "ask", "confront"].includes(action.type)) return result.narration;

    let lieText: string | undefined;
    if (handling === "lie" && lieAbout && CHRIS.knowledge.lies[lieAbout]) {
      lieText = CHRIS.knowledge.lies[lieAbout];
    }

    const ctx = this.deps.narrator.buildContext(state, action, {
      handling: handling ?? "truth",
      lieText,
      topicLabel,
      characterId: "chris",
      discoveredEvidenceTitles: state.evidenceIds,
    });
    const outcome = await this.deps.narrator.narrate(ctx);
    // Append the model's character line AFTER the narrator setup line.
    return [...result.narration, ...outcome.lines];
  }
}

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

export function createEngine(deps: EngineDeps): GameEngine {
  return new GameEngine(deps);
}

/** Convenience factory wiring the default providers + Chris artifacts. */
export function createDefaultEngine(inference: InferenceManager): GameEngine {
  const retrieval = buildRetrievalFromMemories(CHRIS.memories);
  const narrator = new Narrator(inference, retrieval);
  return new GameEngine({ retrieval, narrator, inference });
}

// silence unused import warnings for types used only structurally
void FACTS;
