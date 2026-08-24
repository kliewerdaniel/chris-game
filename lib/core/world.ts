import {
  CharacterId,
  WorldState,
  GameEvent,
  Evidence,
  LocationId,
} from "./types";

export const WORLD_STATE_VERSION = 1;

/**
 * Create a fresh world state. The episode content (locations, characters,
 * facts, evidence) is injected by the engine from the compiled data; this
 * function only establishes the structural baseline so the state is always
 * serializable and complete.
 */
export function createWorldState(opts: {
  playerName?: string;
  startLocation: LocationId;
  characterIds: CharacterId[];
}): WorldState {
  const now = { day: 1, hour: 22, minute: 14 };
  const characterStates = {} as WorldState["characterStates"];
  for (const cid of opts.characterIds) {
    characterStates[cid] = {
      characterId: cid,
      currentLocation: null,
      trust: 50,
      mood: "neutral",
      knowsFactIds: [],
      withheld: [],
      flags: {},
    };
  }
  return {
    version: WORLD_STATE_VERSION,
    player: {
      name: opts.playerName ?? "You",
      health: 100,
      stamina: 70,
      money: 0,
      socialTrust: 30,
    },
    location: opts.startLocation,
    time: { ...now },
    inventory: [],
    contacts: [],
    phoneUnlocked: false,
    knownFacts: [],
    beliefs: [],
    hypotheses: [],
    flags: {},
    quests: {},
    events: [],
    evidenceIds: [],
    characterStates,
    progression: 0,
    episodeComplete: false,
  };
}

/** Deep clone via structured serialization — state is plain data. */
export function cloneWorldState(state: WorldState): WorldState {
  return JSON.parse(JSON.stringify(state)) as WorldState;
}

export function serializeWorldState(state: WorldState): string {
  return JSON.stringify(state);
}

export function deserializeWorldState(raw: string): WorldState {
  const parsed = JSON.parse(raw) as WorldState;
  if (typeof parsed.version !== "number") {
    throw new Error("Invalid world state: missing version");
  }
  return parsed;
}

export function advanceTime(
  state: WorldState,
  minutes: number
): WorldState {
  const t = { ...state.time };
  t.minute += minutes;
  while (t.minute >= 60) {
    t.minute -= 60;
    t.hour += 1;
  }
  while (t.hour >= 24) {
    t.hour -= 24;
    t.day += 1;
  }
  return { ...state, time: t };
}

export function addEvent(
  state: WorldState,
  event: Omit<GameEvent, "timestamp">
): WorldState {
  return {
    ...state,
    events: [
      ...state.events,
      { ...event, timestamp: { ...state.time } },
    ],
  };
}

export function discoverEvidence(
  state: WorldState,
  evidence: Evidence
): WorldState {
  if (state.evidenceIds.includes(evidence.id)) return state;
  return {
    ...state,
    evidenceIds: [...state.evidenceIds, evidence.id],
  };
}

export function setFlag(
  state: WorldState,
  flag: string,
  value: boolean | number | string
): WorldState {
  return { ...state, flags: { ...state.flags, [flag]: value } };
}

export function getFlag(state: WorldState, flag: string): unknown {
  return state.flags[flag];
}

export function addKnownFact(state: WorldState, factId: string): WorldState {
  if (state.knownFacts.includes(factId)) return state;
  return { ...state, knownFacts: [...state.knownFacts, factId] };
}
