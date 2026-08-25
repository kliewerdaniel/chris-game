/**
 * NARRATE BACKEND — the single boundary between the deterministic engine and any
 * inference source.
 *
 * The engine (now running CLIENT-SIDE for public play) must never talk to a model
 * directly. It builds a narration prompt from local world state and hands it to a
 * `NarrateBackend`. Implementations:
 *
 *  - `HostedNarrateBackend`  → used by the browser in public/dev. POSTs the
 *    narration prompt to the same-origin `/api/narrate` serverless function, which
 *    selects a real model (local-in-dev, hosted-in-prod) server-side. The API key
 *    never reaches the client.
 *  - `DeterministicBackend` → returns null. The Narrator then emits its built-in
 *    fail-closed fallback line. This is the "no model configured" path and is the
 *    default for a stranger if `/api/narrate` is unavailable.
 *  - `LocalInferenceBackend` → wraps an `InferenceManager` (local llama.cpp /
 *    ollama) for server-side / test use and for contributor-mode local runs.
 *
 * Whichever backend is in play, the contract is identical: it receives a prompt
 * and returns prose. It can NEVER mutate world state — the engine uses the text
 * for display only. This is the epistemic boundary, unchanged.
 */

export interface NarrateRequest {
  systemInstruction: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface NarrateResult {
  text: string;
  simulated: boolean;
}

export interface NarrateBackend {
  /** true for the stub/backoff paths (so callers can tag output honestly). */
  readonly simulated: boolean;
  narrate(req: NarrateRequest): Promise<NarrateResult | null>;
}

/** No model available. The Narrator substitutes its deterministic fallback. */
export class DeterministicBackend implements NarrateBackend {
  readonly simulated = true;
  async narrate(): Promise<NarrateResult | null> {
    return null;
  }
}

/**
 * Browser-side backend: forwards the narration prompt to the same-origin
 * `/api/narrate` function. Fail-closed — any non-OK response yields null and the
 * Narrator falls back. No API key, no cloud URL ever lives in the client bundle.
 */
export class HostedNarrateBackend implements NarrateBackend {
  readonly simulated = false;
  constructor(private endpoint = "/api/narrate") {}

  async narrate(req: NarrateRequest): Promise<NarrateResult | null> {
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(Number(process.env.NEXT_PUBLIC_NARRATE_TIMEOUT_MS ?? 20_000)),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { text?: string };
      if (typeof data.text !== "string" || !data.text.trim()) return null;
      return { text: data.text, simulated: false };
    } catch {
      return null;
    }
  }
}

/** Server/dev/test backend that drives a local InferenceManager directly. */
export class LocalInferenceBackend implements NarrateBackend {
  readonly simulated = false;
  constructor(private chat: (req: NarrateRequest) => Promise<{ text: string; simulated: boolean }>) {}
  async narrate(req: NarrateRequest): Promise<NarrateResult | null> {
    try {
      return await this.chat(req);
    } catch {
      return null;
    }
  }
}

/**
 * Resolve the backend for the CURRENT runtime context.
 *  - In the browser: HostedNarrateBackend if `NEXT_PUBLIC_NARRATION=hosted`
 *    (the public default), else DeterministicBackend.
 *  - On the server / in tests: callers pass an InferenceManager and we wrap it.
 */
export function createClientBackend(): NarrateBackend {
  if (typeof window === "undefined") return new DeterministicBackend();
  const mode = process.env.NEXT_PUBLIC_NARRATION ?? "hosted";
  if (mode === "off" || mode === "deterministic") return new DeterministicBackend();
  return new HostedNarrateBackend();
}
