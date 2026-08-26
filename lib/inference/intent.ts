import { Intent, IntentVerb, GameAction } from "../core/types";

/**
 * Deterministic natural-language intent parser.
 *
 * This is RULE-BASED, not an LLM call. It maps player text to a structured
 * Intent. If it cannot parse confidently, it returns an "unknown" intent that
 * the engine handles gracefully (asks for clarification) — the LLM is NOT used
 * to parse, because parsing is a state-affecting step and must be deterministic.
 *
 * Verbs supported: look, talk, ask, examine, search, move, use, call, confront,
 * challenge, sleep, tell, wait, inventory, evidence, help.
 */

const VERB_PATTERNS: { verb: IntentVerb; words: string[]; starts?: boolean }[] = [
  // ADR-005: free-form conversational turn. Placed FIRST so continuations like
  // "go on" / "tell me more" / "keep going" / "say" / "chat" win over the bare
  // `move` ("go") and `tell` verbs that would otherwise claim them at pos 0.
  { verb: "chat", words: ["say", "chat", "tell him", "tell her", "i say", "i tell", "tell me more", "go on", "keep going"] },
  { verb: "help", words: ["help", "commands", "what can i do"], starts: true },
  { verb: "inventory", words: ["inventory", "what do i have", "what do i carry", "items"] },
  { verb: "evidence", words: ["evidence", "notebook", "case file", "show me the evidence"] },
  { verb: "sleep", words: ["sleep", "rest", "lie down", "go to sleep", "get some sleep", "turn in"] },
  { verb: "confront", words: ["confront", "accuse", "call him out", "demand the truth", "tell him the truth"] },
  { verb: "challenge", words: ["challenge", "cross-examine", "test that claim", "is that true", "that's not real", "that can't be true", "dispute", "question that"] },
  { verb: "call", words: ["call", "dial", "text", "ring"] },
  { verb: "examine", words: ["examine", "look at", "read", "open", "study", "observe", "inspect", "check"] },
  { verb: "search", words: ["search", "rummage", "look through", "go through", "hunt for", "look for", "find"] },
  { verb: "talk", words: ["talk", "speak", "say to", "say hi", "greet", "approach"] },
  { verb: "ask", words: ["ask", "what happened", "tell me about", "do you know", "why", "who", "when", "where", "how"] },
  { verb: "move", words: ["go", "leave", "walk", "move", "exit", "enter", "head", "step", "close", "shut", "stop", "end"] },
  { verb: "use", words: ["use", "wield", "operate", "turn on", "switch on", "take", "grab", "pick up", "pocket"] },
  { verb: "look", words: ["look", "describe", "where am i", "what is around", "what's around", "what is here"] },
  { verb: "wait", words: ["wait", "sit", "pause", "hold on", "stand"] },
  { verb: "tell", words: ["tell", "let him know", "let her know", "inform"] },
];

/** Position-based verb detection: choose the verb whose trigger word appears
 *  earliest in the text, so "examine the phone" reads as examine, not call. */
function detectVerb(text: string): IntentVerb | undefined {
  const lower = text.toLowerCase();
  let best: { verb: IntentVerb; pos: number } | undefined;
  for (const v of VERB_PATTERNS) {
    for (const w of v.words) {
      const idx = lower.indexOf(w);
      if (idx === -1) continue;
      // `starts` verbs only count when at the beginning (e.g. bare "help").
      if (v.starts && idx > 0) continue;
      if (!best || idx < best.pos) best = { verb: v.verb, pos: idx };
    }
  }
  return best?.verb;
}

const TARGET_PATTERNS: { id: string; names: string[] }[] = [
  { id: "chris", names: ["chris", "him", "he", "kid's friend", "reconstruction", "feed", "the voice"] },
  { id: "mother", names: ["mother", "mom", "ma", "mum"] },
  { id: "phone", names: ["phone", "cell", "mobile", "cellphone", "feed"] },
  { id: "apartment", names: ["apartment", "room", "flat", "place", "home"] },
  { id: "note", names: ["note", "paper", "letter", "page", "envelope", "envelope in my pocket", "the note", "post", "reddit", "source"] },
  { id: "photo", names: ["photo", "picture", "image", "polaroid", "captain"] },
  { id: "door", names: ["door", "exit", "outside"] },
  { id: "laptop", names: ["laptop", "computer", "screen", "model", "output", "log"] },
];

const TOPIC_PATTERNS: { id: string; keys: string[] }[] = [
  { id: "is_chris", keys: ["is it you", "really chris", "really him", "are you chris", "is this chris", "the real chris"] },
  { id: "voice", keys: ["voice", "really him", "is it you", "sounds like"] },
  { id: "memory", keys: ["remember", "memory", "memories", "really him", "have you met"] },
  { id: "cats", keys: ["captain", "cat", "cats"] },
  { id: "mother", keys: ["mother", "mom", "mum"] },
  { id: "act", keys: ["konradfreeman", "the act", "the account", "performing"] },
  { id: "misinfo", keys: ["misinformation", "lies", "fake", "wrong"] },
  { id: "toll", keys: ["cramps", "bed", "bedbound", "stress", "what it's doing", "what it does to me"] },
  { id: "feed", keys: ["feed", "news", "joke", "the reconstruction"] },
];

function matchFirst<T extends { re?: RegExp } & Record<string, any>>(
  text: string,
  items: T[]
): T | undefined {
  const lower = text.toLowerCase();
  for (const it of items) {
    if (it.re && it.re.test(text)) return it;
    for (const k of it.keys ?? it.names ?? []) {
      // Word-boundary match so "the" doesn't match "he" / "chris's" still matches.
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${escaped}(\\b|'s)?`, "i");
      if (re.test(lower)) return it;
    }
  }
  return undefined;
}

export function parseIntent(raw: string): Intent {
  const text = raw.trim();
  const verbMatch = detectVerb(text);
  const targetMatch = matchFirst(text, TARGET_PATTERNS as any);
  const topicMatch = matchFirst(text, TOPIC_PATTERNS as any);

  // "look around" / "look" with no object → pure look
  if (/^\s*look\s*(around|round)?\s*$/i.test(text)) {
    return { verb: "look" };
  }
  if (/^\s*go\s+(to\s+)?(sleep|bed)\s*$/i.test(text)) {
    return { verb: "sleep" };
  }

  const verb: IntentVerb = verbMatch ?? "unknown";
  const modifiers: string[] = [];
  if (/\b(angrily|angry|mad|loud|quietly|softly|carefully|gently)\b/i.test(text)) {
    const m = text.match(/\b(angrily|angry|mad|loud|quietly|softly|carefully|gently)\b/i);
    if (m) modifiers.push(m[1].toLowerCase());
  }

  return {
    verb,
    target: targetMatch?.id,
    topic: topicMatch?.id,
    modifiers,
  };
}

/**
 * Build a GameAction from raw text. Resolution of ids to actual entities is
 * done by the engine (which owns the world); the parser only proposes.
 */
export function parseAction(raw: string): GameAction {
  const intent = parseIntent(raw);
  return {
    intent,
    type: intent.verb,
    targetId: intent.target,
    topicId: intent.topic,
    raw,
  };
}

/** True if the parser is confident enough to act without clarification. */
export function isConfident(action: GameAction): boolean {
  if (["look", "inventory", "evidence", "help", "sleep", "wait"].includes(action.type)) {
    return true;
  }
  if (action.type === "talk" || action.type === "ask") {
    return !!action.targetId;
  }
  if (action.type === "move") return !!action.targetId;
  if (action.type === "examine" || action.type === "search" || action.type === "use") {
    return !!action.targetId;
  }
  if (action.type === "confront") return true;
  if (action.type === "challenge") return true;
  if (action.type === "call") return !!action.targetId;
  if (action.type === "tell") return true;
  if (action.type === "chat") return true; // ADR-005: free-form, always confident
  return false;
}

/**
 * Re-derive `targetId`/`topicId` from raw text using the deterministic rule
 * matchers. Used to repair ids the LLM resolver dropped or mis-cased.
 * VERB-AWARE: when the verb is known (talk/ask/confront/tell/call), character
 * names ("chris", "mother", "phone") are resolved as targets; for
 * examine/search/use the player is naming an OBJECT, so character-name matches
 * are suppressed (e.g. "examine the letter Chris left" must target `note`,
 * not `chris`). This prevents the first-array-match rule from mis-binding a
 * character name embedded in an object description.
 * Returns only the fields it found (so an LLM-supplied valid id is preserved
 * when the rule pass is silent).
 */
const CHARACTER_TARGET_IDS = new Set(["chris", "mother", "phone"]);

export function resolveTargetTopicFromText(
  raw: string,
  verb?: string
): { targetId?: string; topicId?: string } {
  const text = raw.trim();
  const topic = matchFirst(text, TOPIC_PATTERNS as any);
  // For object verbs, exclude character-name ids from target resolution so a
  // name embedded in an object description doesn't hijack the target.
  const targetItems =
    verb && ["examine", "search", "use", "move"].includes(verb)
      ? (TARGET_PATTERNS as any).filter(
          (t: { id: string }) => !CHARACTER_TARGET_IDS.has(t.id)
        )
      : (TARGET_PATTERNS as any);
  const target = matchFirst(text, targetItems);
  const out: { targetId?: string; topicId?: string } = {};
  if (target?.id) out.targetId = target.id;
  if (topic?.id) out.topicId = topic.id;
  return out;
}

/** The closed universe of target ids the rule matcher can resolve. */
export const RESOLVABLE_TARGET_IDS: string[] = TARGET_PATTERNS.map((t) => t.id);
/** The closed universe of topic ids the rule matcher can resolve. */
export const RESOLVABLE_TOPIC_IDS: string[] = TOPIC_PATTERNS.map((t) => t.id);
