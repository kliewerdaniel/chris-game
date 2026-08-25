import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TTS proxy for the Qwen3-TTS Web UI ("vox") running locally on :7860.
 *
 * The game never talks to vox directly from the browser (keeps it localhost-only
 * and CORS-free, and the cloned Chris voice never leaves the machine). This
 * route is a thin, fail-closed bridge:
 *   1. POST {text, voice?} → vox /api/generate_long (voice defaults to chris.wav)
 *   2. fetch the synthesized WAV from vox /api/audio/<id>
 *   3. stream the WAV bytes back same-origin so <audio> can play it.
 *
 * If vox is down or returns an error, we respond 503 and the client silently
 * skips the line — never crashes, never blocks play.
 *
 * DECISION #4: cloned-voice TTS is OFF for public. This route only functions
 * when NEXT_PUBLIC_TTS_ENABLED=1 (local/dev builds). In a public deploy it
 * returns 503 so no localhost clone-voice path is ever reachable.
 */
const TTS_ENABLED = process.env.NEXT_PUBLIC_TTS_ENABLED === "1";
const VOX_BASE = process.env.VOX_BASE_URL || "http://127.0.0.1:7860";
const DEFAULT_VOICE = "chris.wav";

export async function POST(req: NextRequest) {
  if (!TTS_ENABLED) {
    return NextResponse.json({ error: "tts disabled in this build" }, { status: 503 });
  }
  let body: { text?: unknown; voice?: unknown; speed?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const voice = typeof body.voice === "string" && body.voice ? body.voice : DEFAULT_VOICE;
  const speed = typeof body.speed === "number" ? body.speed : 1.0;

  let fileId: string | undefined;
  try {
    const gen = await fetch(`${VOX_BASE}/api/generate_long`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_file: voice, speed }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!gen.ok) return NextResponse.json({ error: "tts generate failed" }, { status: 502 });
    const data = (await gen.json()) as { file_id?: string };
    fileId = data.file_id;
  } catch {
    return NextResponse.json({ error: "tts unavailable" }, { status: 503 });
  }
  if (!fileId) return NextResponse.json({ error: "no file_id" }, { status: 502 });

  try {
    const audio = await fetch(`${VOX_BASE}/api/audio/${fileId}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!audio.ok) return NextResponse.json({ error: "audio fetch failed" }, { status: 502 });
    const buf = await audio.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        "X-Tts-Voice": voice,
      },
    });
  } catch {
    return NextResponse.json({ error: "tts unavailable" }, { status: 503 });
  }
}
