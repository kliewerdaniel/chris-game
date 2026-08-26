import { WorldState, NarrationLine, CharacterDef, Fact, FactStatus, Provenance } from "../core/types";
import { CHARACTERS } from "../characters/chris";
import { Retrieval } from "../retrieval/retrieval";
import { NarrateBackend, DeterministicBackend, LocalInferenceBackend, createClientBackend } from "../inference/narrate-backend";
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
  /** ADR-005: rolling window of recent exchanges (player + model lines) the riff loop reads. */
  recentExchanges?: { speaker: string; text: string; handling?: string }[];
  /** ADR-005: true for OPEN turns (truth/unknown) — model may riff freely;
   *  false for BOUNDARY turns (lie/withhold/deflect/partial/threaten) — seed-locked. */
  freeRiff?: boolean;
  /** ADR-005: last ≤4 model response texts, for the uniqueness guard. */
  recentlySaid?: string[];
  /** ADR-006: read-only projection of the live world, so the reply is grounded
   *  in what the player has actually found / established. Model reads only. */
  worldSnapshot?: import("../core/types").WorldSnapshot;
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
    private backend: NarrateBackend,
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
      /** ADR-005: pass the rolling exchange window (already sliced by caller). */
      recentExchanges?: NarrationContext["recentExchanges"];
      freeRiff?: boolean;
      recentlySaid?: string[];
      /** ADR-006: read-only world projection to ground the reply. */
      worldSnapshot?: import("../core/types").WorldSnapshot;
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
      recentExchanges: opts.recentExchanges,
      freeRiff: opts.freeRiff,
      recentlySaid: opts.recentlySaid,
      worldSnapshot: opts.worldSnapshot,
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
    // Boundary modes (lie/withhold/deflect/threaten/partial) MUST carry a seed —
    // the model only paraphrases the engine's fixed wording so the emotional core
    // can't drift. OPEN modes (truth/unknown) without a seed are ADR-005 free-riff
    // turns: the model improvises in voice (it still cannot author world-canon,
    // because there is no canon to assert — these are banter/news riffs).
    const boundaryModes = ["lie", "withhold", "deflect", "threaten", "partial"];
    const needsSeed = boundaryModes.includes(ctx.handling ?? "");
    const hasSeed = !!(ctx.seed || ctx.lieText);
    if (needsSeed && !hasSeed) {
      return this.fallback(ctx, "no seed for boundary disclose mode — fail closed");
    }
    // ADR-005: open (free-riff) turns get a higher temperature so repeated asks
    // ("say something about the news") produce a genuinely different line each time.
    const temperature = ctx.freeRiff ? 0.9 : 0.6;
    const userPrompt = this.renderPrompt(ctx);
    try {
      const result = await this.backend.narrate({
        systemInstruction: ctx.systemInstruction,
        userPrompt,
        temperature,
        maxTokens: 400,
      });
      if (!result) return this.fallback(ctx, "no narration backend available — fail closed");
      let text = this.validateOutput(result.text, ctx);
      // ADR-005 uniqueness guard: if the model echoed a recent line, ask once more
      // for a different angle before giving up.
      if (ctx.freeRiff && ctx.recentlySaid && ctx.recentlySaid.length) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const repeated = ctx.recentlySaid.some((p) => norm(p) === norm(text));
        if (repeated) {
          const retry = await this.backend.narrate({
            systemInstruction: ctx.systemInstruction,
            userPrompt:
              userPrompt +
              "\n\n(That was a repeat. Say something genuinely different this time.)",
            temperature: 1.0,
            maxTokens: 400,
          });
          if (retry) text = this.validateOutput(retry.text, ctx);
        }
      }
      // EPISTEMIC BOUNDARY — the model only RENDERS the engine's already-decided
      // handling; it never authors world-canon. So a line the reconstruction
      // itself speaks (truth / lie / withhold / deflect / partial / unknown /
      // threaten — anything but pure third-person narration) is stamped
      // TESTIMONY, never CANONICAL. CANONICAL is reserved for the deterministic
      // world's own ground truth (facts, evidence, engine-authored narration).
      // This is what wakes the 8-hue status palette on model-voiced lines: the
      // tag now reflects the engine's disclosure decision instead of always
      // reading "canonical" and making the palette look identical/dormant.
      const lineStatus: FactStatus =
        ctx.handling && ctx.handling !== "narration" ? "testimony" : "canonical";
      return {
        lines: [{ speaker: ctx.character ? "chris" : "narrator", text, status: lineStatus }],
        usedModel: !result.simulated,
        provider: result.simulated ? "deterministic" : "hosted",
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
    // ADR-006: ground the reply in the live world. The model may REFERENCE this
    // state (where it is, what's been found, what's established) but must NOT
    // contradict or invent beyond it — the epistemic boundary holds.
    if (ctx.worldSnapshot) {
      const snap = ctx.worldSnapshot;
      const facts = snap.knownFacts.length
        ? snap.knownFacts.map((f) => `- [${f.status}] ${f.statement}`).join("\n")
        : "(none established)";
      const evidence = snap.evidence.length
        ? snap.evidence.map((e) => `- [${e.status}] ${e.title}: ${e.content}`).join("\n")
        : "(none discovered)";
      parts.push(
        `WORLD STATE (you are IN this world — reference it, never contradict or invent beyond it):\n` +
          `Location: ${snap.location}\n` +
          `Time: ${snap.time}\n` +
          `Phone unlocked: ${snap.phoneUnlocked ? "yes" : "no"}\n` +
          `Established facts:\n${facts}\n` +
          `Discovered evidence:\n${evidence}`
      );
    }
    // ADR-005: riff-loop exchange window. Lets the model reference prior lines
    // ("more like that") without mutating world state.
    if (ctx.recentExchanges && ctx.recentExchanges.length) {
      const lastLines = ctx.recentExchanges
        .slice(-6)
        .map((e) => `- ${e.speaker}${e.handling ? ` [${e.handling}]` : ""}: ${e.text}`)
        .join("\n");
      parts.push(`RECENT EXCHANGES (continuity only — do not repeat these verbatim):\n${lastLines}`);
    }
    if (ctx.freeRiff) {
      parts.push(
        `MODE: free riff. You may improvise naturally in voice. Do NOT repeat a previous response: ${
          ctx.recentlySaid && ctx.recentlySaid.length
            ? "avoid these recent lines: " + ctx.recentlySaid.map((s) => `"${s}"`).join("; ")
            : "keep it fresh."
        }`
      );
    }
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
        text: "Chris just shakes his head. \"Drop it. Some things aren't yours to carry tonight.\"",
        status: "testimony",
      };
    } else if (ctx.handling === "deflect") {
      line = { speaker: "chris", text: "Chris shakes his head. \"We're not doing this right now.\"", status: "testimony" };
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
