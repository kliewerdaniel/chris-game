/**
 * Server-side narration spend guard (ADR-010).
 *
 * No external infra (decision #5: no DB/KV). This is an IN-MEMORY, per-instance
 * throttle — a defense-in-depth guard, NOT an authoritative billing stop. On
 * Vercel a serverless function is ephemeral and may run many instances, so these
 * counters are approximate per-instance. The AUTHORITATIVE ceiling is the model
 * provider's own usage/billing limit; set that too. This guard's job is to fail
 * closed (deny) before a runaway client or loop burns tokens on *our* watch.
 *
 * All caps are env-tunable with safe defaults. On any limiter error we DENY
 * (fail closed) — the client narrator falls back to deterministic prose, so play
 * never breaks, only model-voice narration is temporarily unavailable.
 */

const now = () => Date.now();

const num = (v: string | undefined, d: number): number => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : d;
};

// Hard clamp on what we will EVER ask the model for (per request).
export const MAX_TOKENS_HARD = num(process.env.CHRIS_MAX_TOKENS, 400);

// Per-minute request ceiling (approx, per instance).
const PER_MINUTE_REQUESTS = num(process.env.CHRIS_RATE_PER_MIN, 30);

// Estimated token budget per UTC day (approx, per instance). We estimate
// tokens because we don't get exact counts back from every provider.
const DAILY_TOKEN_BUDGET = num(process.env.CHRIS_DAILY_TOKEN_BUDGET, 250_000);

const estTokens = (chars: number): number => Math.max(1, Math.ceil(chars / 4));

interface MinuteBucket {
  minute: number;
  requests: number;
  tokens: number;
}
interface DayBucket {
  day: string; // UTC YYYY-MM-DD
  tokens: number;
}

// Module-level singletons survive warm starts of a single instance.
let minute: MinuteBucket = { minute: 0, requests: 0, tokens: 0 };
let day: DayBucket = { day: "", tokens: 0 };

export interface SpendCheck {
  ok: boolean;
  clampedMaxTokens: number;
  reason?: string;
}

export function guardNarration(
  systemChars: number,
  userChars: number,
  requestedMaxTokens: number,
): SpendCheck {
  // 1. Always clamp the model request, regardless of rate state.
  const clampedMaxTokens = Math.min(requestedMaxTokens, MAX_TOKENS_HARD);

  try {
    const t = now();
    const thisMinute = Math.floor(t / 60_000);
    const thisDay = new Date(t).toISOString().slice(0, 10);

    if (minute.minute !== thisMinute) minute = { minute: thisMinute, requests: 0, tokens: 0 };
    if (day.day !== thisDay) day = { day: thisDay, tokens: 0 };

    const inTokens = estTokens(systemChars + userChars);
    const outTokens = clampedMaxTokens;
    const reqTokens = inTokens + outTokens;

    // 2. Per-minute request ceiling.
    if (minute.requests >= PER_MINUTE_REQUESTS) {
      return { ok: false, clampedMaxTokens, reason: "rate limit (per minute)" };
    }
    // 3. Daily estimated-token budget.
    if (day.tokens + reqTokens > DAILY_TOKEN_BUDGET) {
      return { ok: false, clampedMaxTokens, reason: "daily token budget reached" };
    }

    // Reserve now so concurrent in-flight requests don't overshoot.
    minute.requests += 1;
    minute.tokens += reqTokens;
    day.tokens += reqTokens;

    return { ok: true, clampedMaxTokens };
  } catch {
    // Limiter failure → deny (fail closed). Client falls back.
    return { ok: false, clampedMaxTokens, reason: "spend guard error" };
  }
}

/** Report configured caps for the capability probe (no keys, no secrets). */
export function spendCaps() {
  return {
    maxTokensHard: MAX_TOKENS_HARD,
    perMinuteRequests: PER_MINUTE_REQUESTS,
    dailyTokenBudget: DAILY_TOKEN_BUDGET,
    note: "in-memory per-instance approx; authoritative ceiling is the provider billing cap",
  };
}
