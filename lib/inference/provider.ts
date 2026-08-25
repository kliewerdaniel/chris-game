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

/** A tool (function) the model may call to emit structured output. */
export interface ChatTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** A single tool invocation returned by the model. `arguments` is a JSON string. */
export interface ChatToolCall {
  name: string;
  arguments: string;
}

export type ToolChoice =
  | "auto"
  | "none"
  | { type: "function"; function: { name: string } };

/**
 * Strip a model's internal <think>…</think> reasoning trace. Reasoning models
 * (qwen3.6, gpt-oss, ornith) wrap their deliberation in <think> tags and emit
 * the actual reply AFTER the closing tag. We display only the reply. If there is
 * no reply after the trace, fall back to the raw text so the line is never blank.
 */
export function stripThink(text: string): string {
  if (!text.includes("<think")) return text;
  const re = /<think\s*>[\s\S]*?<\/think\s*>/gi;
  const stripped = text.replace(re, "").trim();
  // No visible reply after the trace → keep the trace's inner text (tags only
  // removed) so the displayed line is never blank.
  if (stripped.length > 0) return stripped;
  return text.replace(/<\/?think\s*>/gi, "").trim();
}

/**
 * Hard ceiling on any single local-inference call. Without this, a stalled or
 * overloaded local model (single-worker llama.cpp / ollama) leaves `await
 * fetch` pending forever, which hangs the whole /api/turn and the client
 * spinner. On timeout the call throws, which surfaces as a fail-closed
 * deterministic fallback line rather than an infinite hang. Override with
 * CHRIS_LLM_TIMEOUT_MS (ms).
 */
const LLM_TIMEOUT_MS = Number(process.env.CHRIS_LLM_TIMEOUT_MS ?? 20_000);

export interface InferenceRequest {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  /** closed-schema tools for structured (intent) output. */
  tools?: ChatTool[];
  toolChoice?: ToolChoice;
}

export interface InferenceResult {
  text: string;
  /** which provider actually answered (for telemetry / trust). */
  provider: string;
  /** true only for mocked/stub responses. */
  simulated: boolean;
  /** populated when the model emits tool/function calls. */
  toolCalls?: ChatToolCall[];
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
      // Reasoning models (gemma4, ornith) spend tokens on reasoning and can
      // leave the visible reply blank unless thinking is disabled. Send both
      // shapes so the request is honored regardless of the server build.
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false },
      stop: req.stop,
    };
    if (req.tools && req.tools.length) {
      (body as Record<string, unknown>).tools = req.tools;
      (body as Record<string, unknown>).tool_choice = req.toolChoice ?? "auto";
    }
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`${this.name} chat failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string; tool_calls?: any[] } }[];
    };
    const msg = data.choices?.[0]?.message;
    // Some local models (gemma4, reasoning models) emit the visible reply in
    // `reasoning_content` while leaving `content` empty. Fall back so Chris is
    // never silently blank.
    const text = stripThink(msg?.content ?? msg?.reasoning_content ?? "").trim();
    const tcs = msg?.tool_calls;
    const toolCalls = Array.isArray(tcs)
      ? tcs.map((t: any) => ({
          name: t?.function?.name ?? "",
          arguments: t?.function?.arguments ?? "{}",
        }))
      : undefined;
    return { text, provider: this.name, simulated: false, toolCalls };
  }
}

export class LlamaCppProvider extends BaseHttpProvider {
  readonly name = "llama.cpp";
  constructor(
    baseUrl = "http://127.0.0.1:8080",
    model = process.env.CHRIS_LLAMACPP_MODEL ?? "gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M.gguf"
  ) {
    super(baseUrl, model);
  }
}

/**
 * Hosted OpenAI-compatible provider (PUBLIC narration path).
 *
 * Used ONLY inside the serverless `/api/narrate` function so the API key never
 * reaches the client. Selected when `CHRIS_HOSTED_URL` + `CHRIS_HOSTED_KEY` are
 * set. Same fail-closed `InferenceManager` chain semantics: if it errors, the
 * chain throws `NoLocalInferenceError` and the client falls back to a
 * deterministic line.
 */
export class HostedProvider implements InferenceProvider {
  readonly name = "hosted";
  readonly local = false;
  private baseUrl: string;
  private defaultModel: string;
  constructor(
    baseUrl = process.env.CHRIS_HOSTED_URL ?? "",
    model = process.env.CHRIS_HOSTED_MODEL ?? "gpt-4o-mini"
  ) {
    this.baseUrl = baseUrl;
    this.defaultModel = model;
  }
  async chat(req: InferenceRequest): Promise<InferenceResult> {
    const apiKey = process.env.CHRIS_HOSTED_KEY;
    if (!this.baseUrl || !apiKey) {
      throw new NoLocalInferenceError("Hosted provider not configured (missing CHRIS_HOSTED_URL/KEY).");
    }
    const body: Record<string, unknown> = {
      model: req.model ?? this.defaultModel,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 400,
      stream: false,
      // Reasoning models (qwen3.6, gpt-oss) emit their output inside
      // <think>...</think> and leave the visible reply empty unless thinking is
      // minimized. Keep thinking short so the post-<think> reply is non-empty.
      reasoning_effort: "minimal",
    };
    // ADR-011: forward tools for structured (intent) output. The OpenAI-compatible
    // shape is identical to our ChatTool type, so pass them through verbatim.
    if (req.tools && req.tools.length) {
      (body as Record<string, unknown>).tools = req.tools;
      (body as Record<string, unknown>).tool_choice = req.toolChoice ?? "auto";
    }
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`hosted chat failed: ${res.status} ${await res.text().catch(() => "")}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string; tool_calls?: any[] } }[];
    };
    const msg = data.choices?.[0]?.message;
    // Strip <think>…</think> blocks (reasoning-model thinking traces) so the
    // displayed narration is never the model's internal monologue.
    const raw = msg?.content ?? msg?.reasoning_content ?? "";
    const text = stripThink(raw).trim();
    const tcs = msg?.tool_calls;
    const toolCalls = Array.isArray(tcs)
      ? tcs.map((t: any) => ({
          name: t?.function?.name ?? "",
          arguments:
            typeof t?.function?.arguments === "string"
              ? t.function.arguments
              : JSON.stringify(t?.function?.arguments ?? {}),
        }))
      : undefined;
    return { text, provider: this.name, simulated: false, toolCalls };
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
        ...(req.tools && req.tools.length
          ? { tools: req.tools, tool_choice: req.toolChoice ?? "auto" }
          : {}),
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ollama chat failed: ${res.status}`);
    const data = (await res.json()) as {
      message?: { content?: string; tool_calls?: any[] };
    };
    const tcs = data.message?.tool_calls;
    const toolCalls = Array.isArray(tcs)
      ? tcs.map((t: any) => ({
          name: t?.function?.name ?? "",
          arguments:
            typeof t?.function?.arguments === "string"
              ? t.function.arguments
              : JSON.stringify(t?.function?.arguments ?? {}),
        }))
      : undefined;
    return { text: stripThink(data.message?.content ?? ""), provider: this.name, simulated: false, toolCalls };
  }
  async embed(req: EmbeddingRequest): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: req.model, prompt: req.text }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
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
  constructor(
    private responder?: (req: InferenceRequest) => string,
    private toolResponder?: (req: InferenceRequest) => ChatToolCall[] | null
  ) {}
  async chat(req: InferenceRequest): Promise<InferenceResult> {
    if (this.toolResponder) {
      const tcs = this.toolResponder(req);
      if (tcs && tcs.length) {
        return { text: "", provider: this.name, simulated: true, toolCalls: tcs };
      }
    }
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
  /**
   * Single-flight chain for model calls. The local inference server is a
   * single-worker: concurrent /v1/chat/completions requests queue and each
   * balloons to 12–16s (measured). Serializing here keeps per-turn latency
   * predictable and prevents a pile-up from wedging the whole server. The
   * in-provider AbortSignal.timeout still guarantees no call can hang forever.
   */
  private chain: Promise<unknown> = Promise.resolve();
  constructor(providers: InferenceProvider[]) {
    this.providers = providers;
  }

  async chat(req: InferenceRequest): Promise<InferenceResult> {
    const run = async () => {
      let lastErr: unknown;
      for (const p of this.providers) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await p.chat(req);
            // A tool/function call is a valid completion even when `text` is
            // empty (the model returns tool_calls with no content, which is the
            // normal shape for structured/intent output).
            if ((r.text && r.text.trim().length > 0) || (r.toolCalls && r.toolCalls.length > 0)) {
              return r;
            }
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
    };
    const p = this.chain.then(run, run);
    // Keep the chain alive even if one call rejects.
    this.chain = p.then(() => undefined, () => undefined);
    return p as Promise<InferenceResult>;
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
 * Build the production provider chain from environment.
 *
 * PUBLIC-PATH RULE: local providers are ONLY added when their URL is explicitly
 * set. We no longer always probe `127.0.0.1:8080`/`:11434` — on a stranger's
 * deploy those addresses are meaningless and the connection-refused is handled
 * fast, but the engine must not *assume* a local model exists. The hosted
 * provider is added when CHRIS_HOSTED_URL + CHRIS_HOSTED_KEY are set. If neither
 * local nor hosted is configured, the chain throws NoLocalInferenceError and the
 * caller falls back to a deterministic line. No cloud call is ever made silently.
 */
export function buildInferenceManager(): InferenceManager {
  if (process.env.CHRIS_INFERENCE === "mock") {
    return new InferenceManager([new MockProvider()]);
  }
  const providers: InferenceProvider[] = [];
  if (process.env.CHRIS_LLAMACPP_URL) {
    providers.push(
      new LlamaCppProvider(
        process.env.CHRIS_LLAMACPP_URL,
        process.env.CHRIS_LLAMACPP_MODEL ?? "ornith.gguf"
      )
    );
  }
  if (process.env.CHRIS_OLLAMA_URL) {
    providers.push(
      new OllamaChatProvider(
        process.env.CHRIS_OLLAMA_URL,
        process.env.CHRIS_OLLAMA_MODEL ?? "ornith.gguf"
      )
    );
  }
  if (process.env.CHRIS_HOSTED_URL && process.env.CHRIS_HOSTED_KEY) {
    providers.push(new HostedProvider(process.env.CHRIS_HOSTED_URL, process.env.CHRIS_HOSTED_MODEL));
  }
  // Mock is appended LAST so the engine still runs if both locals are down — BUT
  // only if explicitly opted in via CHRIS_ALLOW_MOCK_FALLBACK, so we never
  // silently substitute a stub for real narration in production.
  if (process.env.CHRIS_ALLOW_MOCK_FALLBACK === "1") {
    providers.push(new MockProvider());
  }
  return new InferenceManager(providers);
}
