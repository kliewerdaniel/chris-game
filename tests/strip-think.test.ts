import { describe, it, expect } from "vitest";
import { stripThink } from "../lib/inference/provider";

describe("stripThink", () => {
  it("returns plain text untouched", () => {
    expect(stripThink("Hey Chris, you there?")).toBe("Hey Chris, you there?");
  });

  it("removes a <think>…</think> block and keeps the reply after it", () => {
    const raw = "<think>The user is greeting him. Keep it short.</think>Yeah. I'm here. Sort of.";
    expect(stripThink(raw)).toBe("Yeah. I'm here. Sort of.");
  });

  it("handles lowercase and whitespace variants", () => {
    const raw = "<think > okay </think >\nstill here.";
    expect(stripThink(raw)).toBe("still here.");
  });

  it("falls back to raw when nothing follows the trace (never blank)", () => {
    const raw = "<think>reasoning only, no reply</think>";
    const out = stripThink(raw);
    expect(out.length).toBeGreaterThan(0);
  });
});
