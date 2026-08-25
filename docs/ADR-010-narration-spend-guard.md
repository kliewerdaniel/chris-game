# ADR-010: Narration Spend Guard

**Status:** Accepted
**Date:** 2026-08-25
**Supersedes:** — (extends ADR-009)
**Carries over:** ADR-009 decisions #1 (hosted narration), #2 (client-side engine),
#4 (TTS off for public), #5 (no infra — per-browser localStorage only, no DB/KV).

## Context
ADR-009 shipped a public, client-side build of CHRIS whose only server call is
`/api/narrate` (hosted-model narration behind a serverless function). The model
key is server-side and never reaches the client. The open item from ADR-009 §9
was the **monthly spend ceiling**: a paid key attached to `/api/narrate` must not
be allowed to burn unbounded tokens from a runaway client, a loop, or abuse.

The user ratified: build the guard as a follow-up, fail-closed, before a paid key
is attached.

## Decision
Add a **server-side, fail-closed spend guard** to `/api/narrate`:

1. **Hard per-request token clamp** — `maxTokens` is clamped to
   `CHRIS_MAX_TOKENS` (default 400) no matter what the client sends.
2. **Per-minute request ceiling** — `CHRIS_RATE_PER_MIN` (default 30) requests
   per instance, then deny with `429` + `Retry-After: 60`.
3. **Daily estimated-token budget** — `CHRIS_DAILY_TOKEN_BUDGET` (default
   250,000 estimated tokens) per instance, then deny with `429`.
4. **Fail-closed denials** — any limit hit (or any internal guard error) returns
   `429`. The client narrator already substitutes a **deterministic** line on
   non-200, so play continues text-only; only model-voice narration is
   temporarily unavailable. Never 5xx, never crash.

### Explicit infra caveat (decision #5 honored)
There is **no external state** (no KV/DB/Redis). The counters are **module-level
singletons in memory**, so they are *per serverless-instance* and *approximate* —
a token burst can span multiple instances, and counters reset on cold starts.
Therefore:

> This guard is **defense-in-depth**, not the authoritative billing stop.
> The AUTHORITATIVE ceiling is the model provider's own usage/billing limit.
> Set that in the provider dashboard too. This guard only ensures we deny
> *before* a runaway on our own watch, per instance.

All caps are env-tunable with safe defaults, so the public default needs no
config. The capability probe (`GET /api/narrate`) reports the active caps
(minus secrets) so ops can observe them.

## Rejected alternatives
- **Centralized counter via Vercel KV / Upstash** — rejected: violates decision
  #5 (no infra) and adds a paid dependency for a free game. Revisit only if a
  real multi-instance budget incident occurs.
- **Client-side budget enforcement** — rejected: client can be bypassed; the
  gate must be server-side where the key lives.
- **Hard kill at absolute ceiling (e.g. circuit breaker that stays open)** —
  rejected: must fail *closed to model* but *open to play*; deterministic
  fallback keeps the game alive.

## Consequences
- `/api/narrate` now clamps and rate-limits; denies with 429 under load.
- Game remains fully playable under denial (deterministic prose).
- Provider billing cap remains the real ceiling; this is the first line.
- New module `lib/server/spend-limit.ts`, unit-tested (4 cases).

## Verification
- `tsc` clean, `vitest` 162 passing (4 new spend-limit cases).
- `next build` succeeds; `/api/narrate` unchanged static/dynamic split.
- Live: `GET /api/narrate` reports `spendCaps`; `POST` denies with 429 once the
  per-minute budget is exhausted (tested locally + on deploy).
