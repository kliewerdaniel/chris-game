/**
 * CHRIS — core type system.
 *
 * This module is the single source of truth for the shapes that flow through
 * the deterministic game engine. Nothing here imports a model. The LLM never
 * sees these types as mutable handles; it only receives a projection of them
 * and returns a constrained narration object (see narrative/narrator.ts).
 */

// ---------------------------------------------------------------------------
// Epistemics — THE central gameplay axis.
// ---------------------------------------------------------------------------
/**
 * Every fact, memory, and testimony carries one of these statuses. The player
 * learns to distinguish them. The engine never lets the narrator silently
 * promote a TESTIMONY to CANONICAL.
 */
export type FactStatus =
  | "canonical" // established by the deterministic world (ground truth the engine holds)
  | "inferred" // derived by deterministic rules from canonical facts
  | "testimony" // something a character SAID — may be false, partial, or a lie
  | "belief" // something a character or the player believes
  | "hypothesis" // player or character speculation, unverified
  | "rumor" // secondhand, low reliability
  | "unknown" // not established
  | "observation"; // a fact established by the player's own senses

export type SourceType =
  | "reddit" // KonradFreeman corpus node
  | "conversation" // Chat Compile conversation
  | "compiled_event" // curated from source by the compile layer
  | "game_event" // happened during play (engine-authored)
  | "author"; // author-provided canonical world fact (episode design)

export interface Provenance {
  source: string; // human-readable source label
  sourceType: SourceType;
  sourceId: string; // node id / conversation id / evidence id
  /** confidence 0..1 of the underlying source material (not of the claim). */
  confidence: number;
  /** optional direct quote / excerpt from the source. */
  quote?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// World state
// ---------------------------------------------------------------------------
export type LocationId = string;
export type ItemId = string;
export type EvidenceId = string;
export type CharacterId = string;
export type QuestId = string;
export type FlagId = string;

export interface InventoryItem {
  id: ItemId;
  name: string;
  description: string;
  /** which location it was taken from. */
  acquiredAt?: LocationId;
}

export interface Contact {
  id: string;
  name: string;
  /** phone availability is gated by world state, not the UI. */
  phoneNumber?: string;
  reachable: boolean;
  note?: string;
}

export interface WorldState {
  version: number;
  player: {
    name: string; // in-episode, player is "you" — a reconstruction target
    health: number; // 0..100
    stamina: number; // 0..100
    money: number;
    /** social trust: how much the world/Chris trusts the player. */
    socialTrust: number; // 0..100
  };
  location: LocationId;
  /** in-game clock; episode "THE NIGHT BEFORE" runs late evening → small hours. */
  time: { day: number; hour: number; minute: number };
  inventory: InventoryItem[];
  contacts: Contact[];
  phoneUnlocked: boolean;
  /** facts the player has established/learned (canonical + discovered). */
  knownFacts: string[]; // fact ids
  /** player beliefs/hypotheses tracked for the notebook. */
  beliefs: { id: string; text: string; status: FactStatus }[];
  hypotheses: { id: string; text: string }[];
  /** world flags set by deterministic rules. */
  flags: Record<FlagId, boolean | number | string>;
  quests: Record<QuestId, { id: QuestId; title: string; status: "active" | "done" | "blocked" }>;
  /** canonical events that have occurred this playthrough. */
  events: GameEvent[];
  /** evidence the player has discovered (immutable). */
  evidenceIds: EvidenceId[];
  /** per-character mutable state (trust, location, emotional state, flags). */
  characterStates: Record<CharacterId, CharacterRuntimeState>;
  /** which episode this playthrough is currently inside. */
  episodeId: string;
  /** story progression marker. */
  progression: number;
  /** episode completion. */
  episodeComplete: boolean;
  endingId?: string;
}

export interface CharacterRuntimeState {
  characterId: CharacterId;
  currentLocation: LocationId | null;
  trust: number; // 0..100 — how much they trust the player
  mood: string; // current emotional state label
  /** facts this character currently knows (can diverge from player knownFacts). */
  knowsFactIds: string[];
  /** topics/answers the character is currently refusing to discuss. */
  withheld: string[];
  /** flags for character-specific state (e.g. "contradicted_self"). */
  flags: Record<string, boolean | number | string>;
}

export interface GameEvent {
  id: string;
  type: string;
  description: string;
  timestamp: { day: number; hour: number; minute: number };
  provenance?: Provenance;
}

// ---------------------------------------------------------------------------
// Evidence — immutable once created.
// ---------------------------------------------------------------------------
export type EvidenceKind =
  | "document"
  | "message"
  | "phone_contact"
  | "conversation"
  | "memory"
  | "physical_object"
  | "testimony"
  | "observation"
  | "graph_relationship"
  | "player_discovery";

export interface Evidence {
  id: EvidenceId;
  kind: EvidenceKind;
  title: string;
  /** what it says / shows, verbatim where possible. */
  content: string;
  /** canonical truth status of the evidence itself. */
  status: FactStatus;
  discovered: boolean;
  createdAt: { day: number; hour: number; minute: number };
  provenance: Provenance;
  /** ids of facts this evidence supports or contradicts. */
  supportsFactIds?: string[];
  contradictsFactIds?: string[];
}

// ---------------------------------------------------------------------------
// Actions & intents
// ---------------------------------------------------------------------------
export type IntentVerb =
  | "look"
  | "talk"
  | "ask"
  | "examine"
  | "search"
  | "move"
  | "use"
  | "call"
  | "confront"
  | "sleep"
  | "tell"
  | "wait"
  | "inventory"
  | "evidence"
  | "help"
  | "unknown";

export interface Intent {
  verb: IntentVerb;
  target?: string; // character or object name
  topic?: string; // what the talk/ask is about (e.g. "Sarge")
  modifiers?: string[]; // e.g. "angrily", "quietly"
}

export interface GameAction {
  intent: Intent;
  /** resolved verb the engine understands. */
  type: string;
  targetId?: string; // resolved entity id
  topicId?: string; // resolved topic id
  /** raw player text, preserved for narration. */
  raw: string;
}

export interface ActionResult {
  ok: boolean;
  reason?: string; // why an action was rejected (shown to player)
  /** messages to append to the narrative log. */
  narration: NarrationLine[];
  /** engine-authored events (only when ok). */
  events: GameEvent[];
  /** evidence discovered by this action. */
  discoveredEvidence?: Evidence[];
  /** new facts established. */
  establishedFacts?: string[];
  /** state changes applied (for tests/debug). */
  stateChanges?: Record<string, unknown>;
}

export type Speaker = "narrator" | "chris" | "system" | "player" | "evidence";

export interface NarrationLine {
  speaker: Speaker;
  text: string;
  /** optional: attach an evidence/fact reference for UI linking. */
  ref?: { kind: "evidence" | "fact" | "memory"; id: string };
  /** epistemic tag for styling (testimony vs canonical). */
  status?: FactStatus;
}

// ---------------------------------------------------------------------------
// Character (static definition vs runtime state).
// ---------------------------------------------------------------------------
export interface CharacterMemory {
  id: string;
  text: string;
  /** what this memory actually IS, per the source review queue. */
  kind: "genuine" | "performed" | "fiction" | "mixed";
  status: FactStatus;
  date?: string;
  provenance: Provenance;
}

export interface CharacterKnowledge {
  /** fact ids the character KNOWS (canonical truth they possess). */
  knows: string[];
  /** fact ids the character does NOT know (knowledge boundaries). */
  doesNotKnow: string[];
  /** topics the character will lie about (id -> lie text). */
  lies: Record<string, string>;
  /** topics the character will withhold. */
  withholds: string[];
  /** facts the character holds a false belief about (id -> their false version). */
  misconceptions: Record<string, string>;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  /** short identity blurb for the notebook. */
  identity: string;
  personality: string[];
  voice: {
    /** instructions the narrator uses to voice this character. */
    style: string;
    /** signature phrases / mannerisms. */
    mannerisms: string[];
  };
  motivations: string[];
  fears: string[];
  goals: string[];
  secrets: string[]; // secret ids this character protects
  relationships: Record<CharacterId, string>; // to -> description
  timeline: { date: string; event: string }[];
  memories: CharacterMemory[];
  knowledge: CharacterKnowledge;
  /** baseline trust toward player at episode start. */
  baseTrust: number;
}

// ---------------------------------------------------------------------------
// Facts catalog (canonical world truth + contested claims).
// ---------------------------------------------------------------------------
export interface Fact {
  id: string;
  statement: string;
  status: FactStatus;
  /** whose claim this is, when it's testimony. */
  claimedBy?: CharacterId;
  provenance?: Provenance;
  /** verified by an evidence id (lifts testimony → canonical). */
  verifiedBy?: EvidenceId;
}
