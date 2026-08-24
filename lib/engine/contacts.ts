import { WorldState, ActionResult, NarrationLine } from "../core/types";
import { characterEngine } from "../characters/engine";
import { CHARACTERS } from "../characters/chris";
import { addEvent } from "../core/world";

/**
 * P4 — PHONE CONTACT SYSTEM (DOCUDRAMA REPOINT).
 *
 * Generalizes the old `doCall mother` special-case into a registry of phone
 * contacts. In the docudrama, Daniel can call his MOTHER. The reconstruction is
 * not a phone contact — it is the feed on Daniel's phone, addressed in-episode
 * via talk/ask. Calls that don't connect return deterministic, fail-closed
 * narration; connected calls run through the SAME procedural disclosure policy
 * as an in-person ask.
 *
 * KonradFreeman is intentionally NOT a contact — it is the meta-layer handle
 * Daniel performed through, never a scene voice.
 */

export interface PhoneContactDef {
  id: string;
  name: string;
  phoneNumber: string;
  /** if false, the call never connects — returns the seeded voicemail text. */
  reachableWhenUnlocked: boolean;
  /** An episode where the contact is reachable regardless of the flag. */
  reachableFromEpisodes?: string[];
  /** topic id passed to the disclosure policy when the call connects. */
  topic: string;
  /** deterministic message shown when the call does NOT connect (voicemail). */
  unreachableText: string;
}

export const PHONE_CONTACTS: PhoneContactDef[] = [
  {
    id: "mother",
    name: "Mother",
    phoneNumber: "—",
    // Ep1: she's watching from a distance, not answering. From Ep2 on, she
    // picks up — the story's emotional arc needs her voice, and the disclosure
    // engine already has a mind for her (see MOTHER def).
    reachableWhenUnlocked: false,
    reachableFromEpisodes: ["ep2", "ep3", "ep4"],
    topic: "ep1.mother.knows",
    unreachableText:
      "You dial Mother. It rings. And rings. No answer — only the knowledge that she's watching, and that this call can wait. Or can't.",
  },
];

export function getPhoneContact(id: string): PhoneContactDef | undefined {
  return PHONE_CONTACTS.find((c) => c.id === id);
}

/** The contacts a fresh Ep1 game starts with (gated selections). */
export function defaultContacts(): WorldState["contacts"] {
  return contactsForEpisode("ep1");
}

/**
 * Build the live contacts list for a given episode, resolving each contact's
 * `reachable` flag from its static def. Single source of truth for "who can be
 * called right now" so both the engine (resolveCall) and the UI (Contacts
 * panel) agree without duplicating the reachability rule.
 */
export function contactsForEpisode(episodeId: string): WorldState["contacts"] {
  return PHONE_CONTACTS.map((def) => {
    const reachable =
      def.reachableWhenUnlocked || !!def.reachableFromEpisodes?.includes(episodeId);
    const base = "Watching from a distance. Not answering tonight.";
    return {
      id: def.id,
      name: def.name,
      phoneNumber: def.phoneNumber,
      reachable,
      note: reachable ? `Available in ${episodeId.toUpperCase()}.` : base,
    };
  });
}

function resolveCharacterForContact(contactId: string): string {
  return CHARACTERS[contactId] ? contactId : "chris";
}

/** Resolve a `call <contact>` action. Returns the standard handler shape. */
export function resolveCall(
  s: WorldState,
  contactId: string | undefined
): { state: WorldState; result: ActionResult } {
  if (!s.phoneUnlocked) {
    return {
      state: s,
      result: {
        ok: false,
        reason: "The phone is open to the feed. You haven't pulled up the contacts.",
        narration: [],
        events: [],
      },
    };
  }

  const def = contactId ? getPhoneContact(contactId) : undefined;
  if (!def) {
    return {
      state: s,
      result: {
        ok: true,
        narration: [line("No one else to call. Just the feed, talking in his voice.")],
        events: [],
      },
    };
  }

  const eventId = `ev_call_${def.id}_${s.events.length}`;
  const withEvent = addEvent(s, {
    id: eventId,
    type: "call",
    description: `Player called ${def.name}.`,
  });

  const liveContact = s.contacts.find((c) => c.id === def.id);
  const reachableFromEpisode = !!def.reachableFromEpisodes?.includes(s.episodeId);
  const connects =
    (liveContact?.reachable ?? false) || reachableFromEpisode || def.reachableWhenUnlocked;
  if (!connects) {
    return {
      state: withEvent,
      result: {
        ok: true,
        narration: [line(def.unreachableText)],
        events: withEvent.events,
        stateChanges: { handling: "withhold", why: "contact unreachable — voicemail" },
      } as any,
    };
  }

  const characterId = resolveCharacterForContact(def.id);
  const decision = characterEngine.resolveDisclosure(s, characterId, def.topic, "ask");
  return {
    state: withEvent,
    result: {
      ok: true,
      narration: [line(`You call ${def.name}.`)],
      events: withEvent.events,
      stateChanges: { handling: decision.mode, seed: decision.seed, why: decision.why },
    } as any,
  };
}

function line(text: string): NarrationLine {
  return { speaker: "system", text, status: "canonical" };
}
