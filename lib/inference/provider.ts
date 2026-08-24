/**
 * INFERENCE — local-first abstraction.
 *
 * The game must function without any cloud API. The LLM is a NARRATION engine
 * only: it interprets player intent into prose and voices characters. It never
 * sees mutable world state as something it can change.
 *
 * Providers (conceptual + real):
 *  - LlamaCppProvider  → talks to a local llama-server (OpenAI-compatible) on
 *    e.g. http://127.0.0.1:8080. This is what's live on this machine
 *    (ornith.gguf, the Sovereign Knowledge Compiler's compile model).
 *  - OllamaProvider    → talks to Ollama on :11434 (used for embeddings and as
 *    a chat fallback).
 *  - MockProvider      → deterministic stub for tests / offline. Never calls a
 *    model. Lets the full engine run without inference (required by the
 *    "game still works if the LLM fails" rule).
 *
 * FAIL-CLOSED: if no local provider is reachable, the engine does NOT fall back
 * to a cloud endpoint. It returns an explicit error. Private source material is
 * never transmitted off-machine. A future distributed provider plugs into the
 * same interface (e.g. a swarm of consumer llama.cpp nodes), without changing
 * the engine.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface InferenceRequest {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

export interface InferenceResult {
  text: string;
  /** which provider actually answered (for telemetry / trust). */
  provider: string;
  /** true only for mocked/stub responses. */
  simulated: boolean;
}

export interface EmbeddingRequest {
  model: string;
  text: string;
}

export interface InferenceProvider {
  readonly name: string;
  readonly local: boolean;
  chat(req: InferenceRequest): Promise<InferenceResult>;
  embed?(req: EmbeddingRequest): Promise<number[]>;
}

/** Thrown when no local provider is available. MUST not trigger a cloud call. */
export class NoLocalInferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoLocalInferenceError";
  }
}

abstract class BaseHttpProvider implements InferenceProvider {
  abstract readonly name: string;
  readonly local = true;
  protected baseUrl: string;
  protected defaultModel: string;

  constructor(baseUrl: string, defaultModel: string) {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  async chat(req: InferenceRequest): Promise<InferenceResult> {
    const model = req.model ?? this.defaultModel;
    // ornith.gguf is a reasoning model: it spends reasoning tokens before the
    // visible reply, so a small max_tokens budget starves the actual line.
    // Default to a generous budget; callers may override.
    const maxTokens = req.maxTokens ?? 900;
    const body = {
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: maxTokens,
      stream: false,
      // ornith.gguf is a reasoning model; disable thinking so the full token
      // budget goes to the visible reply (otherwise it starves the spoken line).
      chat_template_kwargs: { enable_thinking: false },
      stop: req.stop,
    };
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`${this.name} chat failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return { text, provider: this.name, simulated: false };
  }
}

export class LlamaCppProvider extends BaseHttpProvider {
  readonly name = "llama.cpp";
  constructor(baseUrl = "http://127.0.0.1:8080", model = "ornith.gguf") {
    super(baseUrl, model);
  }
}

export class OllamaChatProvider extends BaseHttpProvider {
  readonly name = "ollama";
  constructor(baseUrl = "http://127.0.0.1:11434", model = "ornith.gguf") {
    super(baseUrl.replace(/\/$/, ""), model);
  }
  // Ollama's chat endpoint differs from the OpenAI shim; override.
  async chat(req: InferenceRequest): Promise<InferenceResult> {
    const model = req.model ?? this.defaultModel;
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: req.messages,
        stream: false,
        options: { temperature: req.temperature ?? 0.7, num_predict: req.maxTokens ?? 320 },
      }),
    });
    if (!res.ok) throw new Error(`ollama chat failed: ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return { text: data.message?.content ?? "", provider: this.name, simulated: false };
  }
  async embed(req: EmbeddingRequest): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: req.model, prompt: req.text }),
    });
    if (!res.ok) throw new Error(`ollama embed failed: ${res.status}`);
    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding ?? [];
  }
}

/** Deterministic stub. Lets the entire engine run and be tested without a model. */
export class MockProvider implements InferenceProvider {
  readonly name = "mock";
  readonly local = true;
  constructor(private responder?: (req: InferenceRequest) => string) {}
  async chat(req: InferenceRequest): Promise<InferenceResult> {
    const last = req.messages[req.messages.length - 1]?.content ?? "";
    const text = this.responder
      ? this.responder(req)
      : `[${this.name}] ${last.slice(0, 80)}`;
    return { text, provider: this.name, simulated: true };
  }
}

/**
 * Provider chain: tries local providers in order. If ALL fail, throws
 * NoLocalInferenceError — explicitly, with no cloud fallback.
 */
export class InferenceManager {
  private providers: InferenceProvider[] = [];
  constructor(providers: InferenceProvider[]) {
    this.providers = providers;
  }

  async chat(req: InferenceRequest): Promise<InferenceResult> {
    let lastErr: unknown;
    for (const p of this.providers) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await p.chat(req);
          if (r.text && r.text.trim().length > 0) return r;
          // Reasoning models can occasionally emit only thinking tokens; retry
          // once with a larger budget before giving up on this provider.
        } catch (e) {
          lastErr = e;
        }
      }
    }
    // No local provider produced text. Fail closed.
    throw new NoLocalInferenceError(
      `No local inference available${
        lastErr ? ` (last error: ${(lastErr as Error).message})` : ""
      }. The game will not send private source material to a cloud provider.`
    );
  }

  /** Best available embedding provider, else null (retrieval falls back to keyword). */
  async embedFirstAvailable(req: EmbeddingRequest): Promise<number[] | null> {
    for (const p of this.providers) {
      if (p.embed) {
        try {
          return await p.embed(req);
        } catch {
          /* try next */
        }
      }
    }
    return null;
  }

  get activeProviders(): string {
    return this.providers.map((p) => p.name).join(", ");
  }
}

/**
 * Build the production provider chain from environment. Defaults to the two
 * LOCAL endpoints confirmed live on this machine. No cloud provider is ever
 * added. Set CHRIS_INFERENCE=mock to force the offline path.
 */
export function buildInferenceManager(): InferenceManager {
  if (process.env.CHRIS_INFERENCE === "mock") {
    return new InferenceManager([new MockProvider()]);
  }
  const providers: InferenceProvider[] = [];
  if (process.env.CHRIS_LLAMACPP_URL || true) {
    providers.push(
      new LlamaCppProvider(
        process.env.CHRIS_LLAMACPP_URL ?? "http://127.0.0.1:8080",
        process.env.CHRIS_LLAMACPP_MODEL ?? "ornith.gguf"
      )
    );
  }
  if (process.env.CHRIS_OLLAMA_URL || true) {
    providers.push(
      new OllamaChatProvider(
        process.env.CHRIS_OLLAMA_URL ?? "http://127.0.0.1:11434",
        process.env.CHRIS_OLLAMA_MODEL ?? "ornith.gguf"
      )
    );
  }
  // Mock is appended LAST so the engine still runs if both locals are down —
  // BUT only if explicitly opted in via CHRIS_ALLOW_MOCK_FALLBACK, so we never
  // silently substitute a stub for real narration in production.
  if (process.env.CHRIS_ALLOW_MOCK_FALLBACK === "1") {
    providers.push(new MockProvider());
  }
  return new InferenceManager(providers);
}
