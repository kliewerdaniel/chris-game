import { NextRequest, NextResponse } from "next/server";
import { buildInferenceManager } from "../../../lib/inference/provider";
import { NarrateRequest } from "../../../lib/inference/narrate-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUBLIC NARRATION BOUNDARY.
 *
 * The browser ships a deterministic engine and only ever calls THIS function to
 * render prose. The model API key lives in the server env and never reaches the
 * client. The function:
 *   - builds inference from env (local llama.cpp/ollama IF URL set, hosted IF
 *     CHRIS_HOSTED_* set, else none),
 *   - runs the narration prompt,
 *   - returns { text }.
 *
 * Fail-closed: if no provider is configured or the model errors, return 503.
 * The client narrator then substitutes a deterministic line. No state is ever
 * received from or sent to the client — only a prompt and prose.
 */
export async function POST(req: NextRequest) {
  let body: NarrateRequest;
  try {
    body = (await req.json()) as NarrateRequest;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body || typeof body.userPrompt !== "string" || typeof body.systemInstruction !== "string") {
    return NextResponse.json({ error: "missing prompt" }, { status: 400 });
  }

  let manager;
  try {
    manager = buildInferenceManager();
  } catch {
    manager = null;
  }
  if (!manager) {
    return NextResponse.json({ error: "no narration provider configured" }, { status: 503 });
  }

  try {
    const result = await manager.chat({
      messages: [
        { role: "system", content: body.systemInstruction },
        { role: "user", content: body.userPrompt },
      ],
      temperature: body.temperature ?? 0.6,
      maxTokens: body.maxTokens ?? 400,
    });
    const text = result.text?.trim();
    if (!text) return NextResponse.json({ error: "empty narration" }, { status: 503 });
    return NextResponse.json({ text, provider: result.provider, simulated: result.simulated });
  } catch {
    // Model down / unreachable → fail closed. Client falls back.
    return NextResponse.json({ error: "narration unavailable" }, { status: 503 });
  }
}

/** Capability probe: report which narration source is configured (no keys). */
export async function GET() {
  const hasLocal = !!(process.env.CHRIS_LLAMACPP_URL || process.env.CHRIS_OLLAMA_URL);
  const hasHosted = !!(process.env.CHRIS_HOSTED_URL && process.env.CHRIS_HOSTED_KEY);
  return NextResponse.json({
    localOnly: true,
    endpoints: ["/api/narrate"],
    narrationSource: hasHosted ? "hosted" : hasLocal ? "local" : "none",
  });
}
