import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DEBUG endpoint: list the exact model ids your hosted key can call.
 *
 * The live game was failing with Groq `model_not_found` 404s because the public
 * docs advertise "Enterprise"/ContactSales models that a free developer-tier key
 * cannot access. Guessing model ids and redeploying was a losing loop.
 *
 * This endpoint uses the SERVER's own CHRIS_HOSTED_* env (the key never leaves
 * the server) and proxies `GET {baseUrl}/models`, returning only the `id` list —
 * no key, no secrets. Hit it once, paste the `id` array, and we set
 * CHRIS_HOSTED_MODEL to a confirmed-good value. Remove this route later.
 */
export async function GET() {
  const url = process.env.CHRIS_HOSTED_URL;
  const key = process.env.CHRIS_HOSTED_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "no hosted provider configured" }, { status: 503 });
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json({ error: "models list failed", status: res.status, body }, { status: 502 });
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    const ids = (data.data ?? []).map((m) => m.id).sort();
    return NextResponse.json({ count: ids.length, models: ids });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
