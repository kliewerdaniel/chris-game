import { WorldState, NarrationLine, CharacterDef, Fact, Provenance } from "../core/types";
import { CHARACTERS } from "../characters/chris";
import { Retrieval } from "../retrieval/retrieval";
import { InferenceManager, NoLocalInferenceError } from "../inference/provider";
import { GameAction } from "../core/types";

/**
 * The NARRATOR turns a validated, deterministic outcome into prose via the
 * local model. It NEVER invents facts: the context object it sends the model
 * is built entirely from canonical world state + character voice, and the
 * model's output is validated before it becomes a NarrationLine.
 *
 * Context budget is explicit: only the relevant character, the current topic,
 * nearby memories, and active evidence are sent — never the whole corpus.
 */

export interface NarrationContext {
  action: GameAction;
  character?: CharacterDef;
  characterMood?: string;
  playerLocation: string;
  time: string;
  /** the engine-decided handling for this turn (truth/lie/withhold/etc). */
  handling?:
    | "truth"
    | "partial"
    | "lie"
    | "withhold"
    | "deflect"
    | "joke"
    | "threaten"
    | "unknown"
    | "narration";
  lieText?: string;
  /** pre-authored seed the model MUST render verbatim/paraphrase (fail-closed). */
  seed?: string;
  topicLabel?: string;
  relevantMemories: { text: string; kind: string; source: string }[];
  discoveredEvidenceTitles?: string[];
  /** system instruction: voice + hard constraints. */
  systemInstruction: string;
}

export interface NarrationOutcome {
  lines: NarrationLine[];
  usedModel: boolean;
  provider?: string;
  simulated: boolean;
  /** populated when no local inference was available (fail-closed). */
  inferenceUnavailable?: boolean;
  error?: string;
}

const HARD_CONSTRAINTS = `
You are narrating a literary text adventure. STRICT RULES:
- Never invent new facts, locations, characters, or events. Use only what is in the context.
- Never reveal information the context marks as withheld or secret.
- If handling is "withhold", the character deflects or refuses WITHOUT revealing the truth.
- If handling is "lie", the character says exactly the provided lie text (or a faithful paraphrase) and does NOT contradict it.
- Stay in the character's voice. Plain, short sentences. Do not explain the rules.
- Output ONLY the character's spoken line or the narration. No meta-commentary.
- Keep it to 1-3 sentences unless the context asks for more.
`;

function buildSystemInstruction(def?: CharacterDef): string {
  if (!def) return HARD_CONSTRAINTS + "\nYou are the third-person narrator.";
  return (
    HARD_CONSTRAINTS +
    `\nCHARACTER: ${def.name}. ${def.identity}\n` +
    `VOICE: ${def.voice.style}\n` +
    `MANNERISMS: ${def.voice.mannerisms.join("; ")}\n` +
    `PERSONALITY: ${def.personality.join(", ")}`
  );
}

export class Narrator {
  constructor(
    private inference: InferenceManager,
    private retrieval: Retrieval
  ) {}

  /** Build the minimal context for a turn. Deterministic. */
  buildContext(
    state: WorldState,
    action: GameAction,
    opts: {
      handling?: NarrationContext["handling"];
      lieText?: string;
      seed?: string;
      topicLabel?: string;
      characterId?: string;
      discoveredEvidenceTitles?: string[];
    } = {}
  ): NarrationContext {
    const def = opts.characterId ? CHARACTERS[opts.characterId] : undefined;
    const rt = opts.characterId ? state.characterStates[opts.characterId] : undefined;
    const memories = def
      ? this.retrieval.search(`${def.name} ${opts.topicLabel ?? ""}`, 3).map((m) => ({
          text: m.text,
          kind: m.kind,
          source: m.provenance.source,
        }))
      : [];
    return {
      action,
      character: def,
      characterMood: rt?.mood,
      playerLocation: state.location,
      time: formatTime(state.time),
      handling: opts.handling,
      lieText: opts.lieText,
      seed: opts.seed,
      topicLabel: opts.topicLabel,
      relevantMemories: memories,
      discoveredEvidenceTitles: opts.discoveredEvidenceTitles,
      systemInstruction: buildSystemInstruction(def),
    };
  }

  /**
   * Generate narration. If local inference is unavailable, returns a graceful
   * deterministic fallback line (never throws to the player; the engine still
   * records the action). This satisfies "the game stays playable if the LLM
   * produces an invalid response."
   */
  async narrate(ctx: NarrationContext): Promise<NarrationOutcome> {
    // FAIL-CLOSED: the model may only GENERATE prose when the engine has handed it
    // a seed (lie/withhold/deflect/threaten/partial) OR this is pure narration.
    // For unseeded disclose modes (truth/unknown with no seed), we never let the
    // model invent world-canon — we fall back to the deterministic line. This is
    // the epistemic boundary: the model renders, it does not author facts.
    const discloseModes = ["truth", "lie", "withhold", "deflect", "threaten", "partial", "unknown"];
    const needsSeed = discloseModes.includes(ctx.handling ?? "");
    const hasSeed = !!(ctx.seed || ctx.lieText);
    if (needsSeed && !hasSeed) {
      return this.fallback(ctx, "no seed for disclose mode — fail closed");
    }
    const userPrompt = this.renderPrompt(ctx);
    try {
      const result = await this.inference.chat({
        messages: [
          { role: "system", content: ctx.systemInstruction },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens: 400,
      });
      const text = this.validateOutput(result.text, ctx);
      return {
        lines: [{ speaker: ctx.character ? "chris" : "narrator", text, status: ctx.handling === "lie" ? "testimony" : "canonical" }],
        usedModel: !result.simulated,
        provider: result.provider,
        simulated: result.simulated,
      };
    } catch (e) {
      if (e instanceof NoLocalInferenceError) {
        return this.fallback(ctx, e.message);
      }
      return this.fallback(ctx, (e as Error).message);
    }
  }

  /** Output validation: strip disallowed content, enforce voice. */
  private validateOutput(text: string, _ctx: NarrationContext): string {
    let t = text.trim();
    // Remove any meta/instruction leakage.
    t = t.replace(/^(system:|assistant:|user:|\[|\()/i, "").trim();
    // No markdown fences.
    t = t.replace(/```/g, "").trim();
    if (t.length === 0) t = "(Chris is quiet for a long moment.)";
    return t;
  }

  private renderPrompt(ctx: NarrationContext): string {
    const parts: string[] = [];
    parts.push(
      `SCENE: The player is in "${ctx.playerLocation}" at ${ctx.time}. ${
        ctx.character ? `${ctx.character.name} is present (mood: ${ctx.characterMood ?? "neutral"}).` : "No character is present."
      }`
    );
    if (ctx.handling === "lie" && (ctx.lieText || ctx.seed)) {
      parts.push(`HANDLING: lie. The character must say (paraphrase faithfully): "${(ctx.seed ?? ctx.lieText) ?? ""}"`);
    } else if (ctx.handling === "withhold") {
      parts.push(`HANDLING: withhold. The character deflects and does NOT reveal the truth about "${ctx.topicLabel ?? "this"}".`);
    } else if (ctx.handling === "partial") {
      parts.push(`HANDLING: partial. The character reveals something but holds the deeper truth about "${ctx.topicLabel ?? "this"}".`);
    } else if (ctx.handling === "deflect") {
      parts.push(`HANDLING: deflect. The character steers away with a joke or subject change about "${ctx.topicLabel ?? "this"}".`);
    } else if (ctx.handling === "threaten") {
      parts.push(`HANDLING: threaten. The character becomes defensive and warns the player off "${ctx.topicLabel ?? "this"}".`);
    } else if (ctx.handling === "joke") {
      parts.push(`HANDLING: joke. The character defuses the moment with dark humor.`);
    } else if (ctx.handling === "truth") {
      parts.push(`HANDLING: truth. The character may speak about "${ctx.topicLabel ?? "this"}".`);
    }
    if (ctx.relevantMemories.length) {
      parts.push("RELEVANT (voice reference only, do not quote as fact):");
      for (const m of ctx.relevantMemories) parts.push(`- [${m.kind}] ${m.text}`);
    }
    parts.push(`PLAYER ACTION: "${ctx.action.raw}"`);
    parts.push("Respond as the character or narrator. Stay in voice.");
    return parts.join("\n");
  }

  private fallback(ctx: NarrationContext, err: string): NarrationOutcome {
    let line: NarrationLine;
    if (ctx.handling === "lie" && (ctx.seed || ctx.lieText)) {
      line = { speaker: "chris", text: (ctx.seed ?? ctx.lieText)!, status: "testimony" };
    } else if (ctx.handling === "withhold") {
      line = {
        speaker: "chris",
        text: "Chris just shakes his head. \"Drop it, kid. Some things aren't yours to carry tonight.\"",
        status: "testimony",
      };
    } else if (ctx.handling === "deflect") {
      line = { speaker: "chris", text: "Chris shakes his head. \"We're not doing this right now, kid.\"", status: "testimony" };
    } else if (ctx.handling === "threaten") {
      line = {
        speaker: "chris",
        text: "Chris's voice goes flat. \"You push this and we're gonna have a problem. Drop it.\"",
        status: "testimony",
      };
    } else if (ctx.handling === "partial") {
      line = {
        speaker: "chris",
        text: "Chris gives you a sliver of the truth, and you can tell there's more he's not saying.",
        status: "testimony",
      };
    } else if (ctx.character) {
      line = { speaker: "chris", text: `${ctx.character.name} doesn't answer right away.` };
    } else {
      line = { speaker: "narrator", text: "The room holds its silence." };
    }
    return {
      lines: [line],
      usedModel: false,
      simulated: true,
      inferenceUnavailable: true,
      error: err,
    };
  }
}

export function formatTime(t: { day: number; hour: number; minute: number }): string {
  const h = ((t.hour + 11) % 12) + 1;
  const ampm = t.hour < 12 ? "AM" : "PM";
  const mm = t.minute.toString().padStart(2, "0");
  return `Day ${t.day}, ${h}:${mm} ${ampm}`;
}

// Re-export for engine convenience.
export type { Provenance, Fact };
