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
// Character cognition — belief state, goals, and procedural disclosure.
// A character is a BOUNDED AGENT: it perceives the world, holds beliefs,
// pursues goals, and decides what to say via a deterministic policy. The LLM
// only renders the resulting decision; it never decides or mutates state.
// ---------------------------------------------------------------------------

/** How a character chooses to answer a topic. Decided deterministically. */
export type DisclosureMode =
  | "truth" // says what it knows
  | "partial" // reveals some, withholds the rest
  | "lie" // asserts a seeded falsehood (anchored, never model-fabricated)
  | "withhold" // refuses / changes the subject
  | "deflect" // steers away with a joke or subject change
  | "joke" // defuses via humor
  | "threaten" // becomes defensive / warns
  | "unknown"; // does not know and has nothing to hide

export interface Belief {
  id: string;
  /** what the character believes. */
  text: string;
  /** 0..1 confidence in the belief. */
  confidence: number;
  source: "canonical" | "perception" | "testimony" | "memory" | "inference";
  /** 0..1 — how much this belief matters to the character emotionally. */
  emotionalWeight: number;
  /** ids of facts/beliefs this belief supports. */
  supports: string[];
  /** ids of facts/beliefs this belief contradicts. */
  contradicts: string[];
  /** player-facing topic ids that, when asked, trigger this belief-driven response (optional). */
  topics?: string[];
  /** if this belief is a deliberate falsehood, the canonical fact it hides. */
  lieAboutFactId?: string;
}

export interface Goal {
  id: string;
  text: string;
  kind: "primary" | "secondary" | "hidden" | "constraint" | "emotional";
  /** 0..1 — how hard the character pursues this. */
  weight: number;
  active: boolean;
}

/** The deterministic output of the disclosure policy for one topic. */
export interface DisclosureDecision {
  mode: DisclosureMode;
  topic: string;
  /** canonical fact a lie concerns (present only when mode === "lie"). */
  lieAboutFactId?: string;
  /** pre-authored wording the narrator MUST render (fail-closed). */
  seed?: string;
  /** human-readable reason — for debug and provenance trails. */
  why: string;
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
  /** deterministic world events already fired this playthrough (idempotency). */
  firedEventIds?: string[];
  /** ADR-005: rolling conversation transcript the riff loop reads (player + model lines). */
  conversationLog: Exchange[];
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
  /** the character's live belief state (may diverge from canonical world). */
  beliefs: Belief[];
  /** the character's live objective stack. */
  goals: Goal[];
  /** how many times the player has asked each topic (pressure tracking). */
  askedTopics: Record<string, number>;
  /** set true briefly after a confront; decays on the next ask/turn. */
  recentlyConfronted: boolean;
  /** flags for character-specific state (e.g. "contradicted_self"). */
  flags: Record<string, boolean | number | string>;
  /** ADR-005: last ≤4 model response texts, for the uniqueness guard in the riff loop. */
  recentlySaid: string[];
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
// Conversation log (ADR-005) — the rolling memory the riff loop reads.
// ---------------------------------------------------------------------------
export interface Exchange {
  turn: number;
  /** who spoke this line. */
  speaker: CharacterId | "player" | "narrator";
  /** the verb that produced it (for player turns; undefined for model lines). */
  verb?: IntentVerb;
  /** the disclosure topic, when this exchange was a disclosure turn. */
  topicId?: string;
  /** the handling the engine DECIDED (rule-only) — never the model's choice. */
  handling?: DisclosureMode;
  text: string;
  ts: { day: number; hour: number; minute: number };
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
  | "chat" // ADR-005: free-form conversational turn (riff loop)
  | "unknown";

export interface Intent {
  verb: IntentVerb;
  target?: string; // character or object name
  topic?: string; // what the talk/ask is about (e.g. "is_chris")
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
  /** secret ids this character protects (gates disclosure + goal conflict). */
  secrets?: string[];
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
  /** live belief state (may diverge from canonical world). */
  beliefs?: Belief[];
  /** structured objective stack for the disclosure engine (optional). */
  goalStack?: Goal[];
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
