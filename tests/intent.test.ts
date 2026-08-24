import { describe, it, expect } from "vitest";
import { parseIntent, parseAction, isConfident } from "../lib/inference/intent";

describe("Intent parser (deterministic, no LLM)", () => {
  it("parses look around", () => {
    const a = parseAction("look around");
    expect(a.intent.verb).toBe("look");
    expect(isConfident(a)).toBe(true);
  });

  it("parses talk to Chris", () => {
    const a = parseAction("talk to Chris");
    expect(a.type).toBe("talk");
    expect(a.targetId).toBe("chris");
    expect(isConfident(a)).toBe(true);
  });

  it("parses ask Chris about Sarge", () => {
    const a = parseAction("ask Chris what happened to Sarge");
    expect(a.type).toBe("ask");
    expect(a.targetId).toBe("chris");
    expect(a.topicId).toBe("sarge");
  });

  it("parses examine the note", () => {
    const a = parseAction("examine the note on the floor");
    expect(a.type).toBe("examine");
    expect(a.targetId).toBe("note");
  });

  it("parses confront Chris", () => {
    const a = parseAction("confront Chris about the truth");
    expect(a.type).toBe("confront");
  });

  it("parses search the room", () => {
    const a = parseAction("search the room");
    expect(a.type).toBe("search");
    expect(a.targetId).toBe("apartment");
  });

  it("parses sleep", () => {
    const a = parseAction("go to sleep");
    expect(a.type).toBe("sleep");
  });

  it("parses call Mother (after phone unlocked)", () => {
    const a = parseAction("call Mother");
    expect(a.type).toBe("call");
    expect(a.targetId).toBe("mother");
  });

  it("parses leave the apartment as move", () => {
    const a = parseAction("leave the apartment");
    expect(a.type).toBe("move");
    expect(a.targetId).toBe("apartment");
  });

  it("is not confident for talk without a target", () => {
    const a = parseAction("talk");
    expect(isConfident(a)).toBe(false);
  });

  it("captures modifiers like angrily", () => {
    const a = parseAction("angrily confront Chris");
    expect(a.intent.modifiers).toContain("angrily");
  });
});
