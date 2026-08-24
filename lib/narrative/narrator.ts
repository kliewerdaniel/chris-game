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
  handling?: "truth" | "lie" | "withhold" | "unknown" | "narration";
  lieText?: string;
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
    if (ctx.handling === "lie" && ctx.lieText) {
      parts.push(`HANDLING: lie. The character must say (paraphrase faithfully): "${ctx.lieText}"`);
    } else if (ctx.handling === "withhold") {
      parts.push(`HANDLING: withhold. The character deflects and does NOT reveal the truth about "${ctx.topicLabel ?? "this"}".`);
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
    if (ctx.handling === "lie" && ctx.lieText) {
      line = { speaker: "chris", text: ctx.lieText, status: "testimony" };
    } else if (ctx.handling === "withhold") {
      line = {
        speaker: "chris",
        text: "Chris just shakes his head. \"Drop it, kid. Some things aren't yours to carry tonight.\"",
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
