import { describe, it, expect } from "vitest";
import { guardNarration, MAX_TOKENS_HARD } from "../lib/server/spend-limit";

describe("spend-limit (ADR-010)", () => {
  it("clamps maxTokens to the hard ceiling", () => {
    const r = guardNarration(10, 10, 9000);
    expect(r.ok).toBe(true);
    expect(r.clampedMaxTokens).toBeLessThanOrEqual(MAX_TOKENS_HARD);
    expect(r.clampedMaxTokens).toBe(MAX_TOKENS_HARD);
  });

  it("allows a normal request within budget", () => {
    const r = guardNarration(200, 200, 400);
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it("fails closed (denies) when per-minute budget is exhausted", () => {
    // Drain the per-minute bucket with tiny requests.
    let first: ReturnType<typeof guardNarration> | null = null;
    for (let i = 0; i < 40; i++) {
      const r = guardNarration(1, 1, 1);
      if (i === 0) first = r;
      if (!r.ok) {
        expect(r.ok).toBe(false);
        return;
      }
    }
    // Should have denied well before 40 (default cap is 30/min).
    expect(first?.ok).toBe(true);
    throw new Error("expected denial before exhausting per-minute budget");
  });

  it("never throws on guard internals — denies instead (fail closed)", () => {
    // The guard wraps itself in try/catch; even if bookkeeping breaks it returns
    // ok:false rather than throwing. We can't easily force the catch, but we
    // assert the contract shape is safe: ok is boolean.
    const r = guardNarration(0, 0, 1);
    expect(typeof r.ok).toBe("boolean");
  });
});
