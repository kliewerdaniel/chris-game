# ADR-009 — Public Deployment Architecture (Stranger-Clicks-A-Link)

**Status:** Proposed — Phase 0 design checkpoint (review before code changes land).
**Date:** 2026-08-24
**Supersedes / refines:** ARCHITECTURE.md (local-first dev topology), the "send a URL and play" goal.

## 1. Context

CHRIS is a literary survival mystery: a compiled knowledge graph becomes a living
world under a **deterministic game engine**; an LLM is a **narration-only**
interface that does NOT define reality. We want a stranger to click a URL and
play — no install, no Ollama, no API key, no account, no understanding of the
knowledge graph.

### Ratified decisions (from the deployment audit, 2026-08-24)
1. **Hosted-model narration from day one** — a hosted OpenAI-compatible model
   behind a serverless function; key stays server-side.
2. **Deterministic engine runs CLIENT-SIDE** (static browser bundle); only
   narration hits a serverless function.
3. **Hosting target = Vercel** (Node serverless functions for `/api/narrate`).
4. **Cloned-voice TTS (vox) is OFF for public** — local/dev-only, never shipped.
5. **No infrastructure** — `localStorage` only; no database, no KV, no
   cross-device continue.
6. Inference is env-configurable and **fail-closed**; no budget assumptions
   baked in.

## 2. Core identity preserved (invariants — do not break)
- The **deterministic engine** is the sole authority that mutates `WorldState`.
- The **compiled world** (`data/compiled/chris.json` + episodes) is canonical
  authority; it ships as static data.
- The **LLM is narration-only**, reads a read-only projection, and **cannot
  mutate state**. Its output is validated and, on any failure, replaced by a
  deterministic fallback line.
- The **epistemics** (fact / testimony / belief / hypothesis / rumor / unknown,
  contradictions, the unreliable narrator) are the game and are untouched.
- **No client cloud calls. No secrets in the client bundle.**

## 3. Architecture (public)

```
BROWSER (static bundle)                         VERCEL SERVERLESS
─────────────────────────                       ───────────────────────
Deterministic GameEngine (bundled)              app/api/narrate/route.ts
  ├─ rule-based intent parser (no LLM)            ├─ builds inference from env:
  ├─ episode dispatch (deterministic)             │    • local llama.cpp/ollama IF URL set (dev)
  ├─ investigation graph (deterministic)          │    • hosted OpenAI-compat IF CHRIS_HOSTED_* set
  └─ Narrator → NarrateBackend                    │    • else → 503 (no model)
       └─ HostedNarrateBackend                      └─ returns { text } (fail-closed)
            └─ POST /api/narrate ───────────────▶
WorldState ⇄ localStorage (no server state)
Compiled world + episodes: bundled at build
TTS: disabled in public (NEXT_PUBLIC_TTS_ENABLED unset)
```

- The browser computes every turn locally. It sends **only the narration prompt**
  (character voice, scene, handling, seed, retrieved memories, read-only world
  snapshot) to `/api/narrate`. It never sends mutable state, and the returned
  text is used *only* for display — the engine never trusts it.
- `/api/narrate` is the **single** server endpoint. It is fail-closed: if no
  inference source is configured, it returns 503 and the client narrator falls
  back to a deterministic line (the world still talks back).

## 4. Why this shape
- **Build expensively once → serve cheaply many times.** The expensive part
  (the world, the engine, the episodes) is compiled into the static bundle and
  served by a CDN. Per-player runtime cost is near-zero; only narration calls a
  model.
- **Stateless by construction.** The server holds no player state, so 10–100
  anonymous strangers cannot interfere with one another and there is no rate
  bomb from the engine itself.
- **Honors local-first.** The exact same engine code runs in dev against a local
  model via the same `/api/narrate` boundary (env-selected). The public build
  simply points that boundary at a hosted model. No architectural fork.

## 5. Changes required (Phase 1)
- `lib/inference/narrate-backend.ts` (new): `NarrateBackend` interface +
  `HostedNarrateBackend` (client, POSTs `/api/narrate`) + `DeterministicBackend`
  (returns nothing → fallback). `LocalInferenceBackend` wraps `InferenceManager`
  for dev/server use.
- `lib/narrative/narrator.ts`: take a `NarrateBackend` instead of an
  `InferenceManager`; replace the `inference.chat` call with
  `backend.narrate`. Keep `createNarrateBackend(local|hosted|deterministic)`.
- `app/api/narrate/route.ts` (new): env-selected inference (local/hosted/none),
  fail-closed 503.
- `lib/inference/provider.ts`: add `HostedProvider` (OpenAI-compatible);
  gate local providers behind their URL env (remove the `|| true` always-on
  localhost attempts) so production never probes `127.0.0.1`.
- `components/GameClient.tsx`: run the engine **client-side** — replace
  `/api/turn` calls with `createClientEngine().processTurn(state, input)`;
  replace `/api/investigation` with local `buildInvestigationPayload(state)`.
- `app/api/turn/route.ts` and `app/api/investigation/route.ts`: **remove**
  (engine + investigation now run client-side). Keep `app/api/tts/route.ts` for
  dev parity but gate the voice UI off in public.
- `app/globals.css` / `GameClient.tsx`: **confirm dialog on `[new game]`** (data-
  loss fix) and a one-line "Type and press Enter" affordance.
- `next.config.mjs`: drop the dead `ollama` externalization (it is not a dep).

## 6. Security
- Model API key lives only in Vercel env, never the client bundle. The client
  only ever calls a same-origin `/api/narrate`.
- Player free-text enters the narration prompt; it cannot mutate state (engine
  ignores returned text for transitions) and `HARD_CONSTRAINTS` forbid the model
  from inventing facts. This is the existing epistemic boundary, unchanged.
- `/api/narrate` must have rate limiting + a spend ceiling before real traffic.
  The engine endpoint needs no rate limiting (it is client-side, deterministic).

## 7. Testing / verification
- `npx tsc -p tsconfig.json --noEmit` clean.
- `npx vitest run` — all 158 + existing engine/narrator tests pass (engine is
  hermetic with a mock narrator; unaffected by the backend swap).
- `npm run build` succeeds; `.next` static/client chunks contain the engine.
- **Live public-path check:** deploy preview → fresh incognito → play Ep1 to an
  ending **with no local model running**; confirm narration falls back
  gracefully and no request to `127.0.0.1` or any cloud endpoint appears in the
  network tab. Then enable hosted narration env and confirm voice returns.
- Confirm `[new game]` now requires confirmation; refresh mid-game resumes.

## 8. Out of scope for Phase 1 (explicit non-goals)
- Cross-device continue (no DB — decision #5).
- Cloned-voice TTS in public (decision #4).
- Account / auth / multiplayer.
- Any database, queue, or microservice.

## 9. Open items to confirm at review
- Exact hosted provider + monthly spend ceiling (decision #6 left open).
- Whether to keep `app/api/tts/route.ts` in the public bundle at all (recommend
  removing it; it is dead in public).
