import { describe, it, expect } from "vitest";
import { createWorldState, advanceTime } from "../lib/core/world";
import { resolveCall, defaultContacts, getPhoneContact, PHONE_CONTACTS } from "../lib/engine/contacts";
import {
  WORLD_EVENTS,
  applyWorldEvents,
  collectDueEvents,
  isDue,
} from "../lib/engine/world-events";
import { buildInvestigationPayload } from "../lib/core/investigation";

function fresh(): ReturnType<typeof createWorldState> {
  let s = createWorldState({ startLocation: "apartment_living", characterIds: ["chris", "mother"] });
  s = { ...s, contacts: defaultContacts() };
  return s;
}

describe("P4 — phone contact system", () => {
  it("registry has mother + sarge contacts", () => {
    expect(PHONE_CONTACTS.map((c) => c.id).sort()).toEqual(["mother", "sarge"]);
    expect(getPhoneContact("mother")?.reachableWhenUnlocked).toBe(false);
    expect(getPhoneContact("sarge")?.reachableWhenUnlocked).toBe(true);
  });

  it("calling before unlocking the phone is rejected", () => {
    const s = fresh();
    const { result } = resolveCall(s, "mother");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/phone/i);
  });

  it("calling Mother (unreachable) returns voicemail, no model, no state leak", () => {
    let s = fresh();
    s = { ...s, phoneUnlocked: true };
    const { state, result } = resolveCall(s, "mother");
    expect(result.ok).toBe(true);
    expect(result.narration[0].text).toMatch(/rings/i);
    expect(state.firedEventIds ?? []).not.toContain("ev_call_mother");
  });

  it("calling Sarge voicemail (reachable) connects deterministically", () => {
    let s = fresh();
    s = { ...s, phoneUnlocked: true };
    const { result } = resolveCall(s, "sarge");
    expect(result.ok).toBe(true);
    expect(result.narration[0].text).toMatch(/voicemail/i);
  });

  it("calling an unknown contact returns a calm no-op", () => {
    let s = fresh();
    s = { ...s, phoneUnlocked: true };
    const { result } = resolveCall(s, "ghost");
    expect(result.ok).toBe(true);
    expect(result.narration[0].text).toMatch(/no one else/i);
  });
});

describe("P4 — scheduled world events", () => {
  it("WORLD_EVENTS are deterministic and seeded (no model)", () => {
    for (const ev of WORLD_EVENTS) {
      expect(Array.isArray(ev.narration)).toBe(true);
      expect(ev.narration.length).toBeGreaterThan(0);
      expect(ev.narration[0].status).toBe("canonical");
    }
  });

  it("time-triggered event fires after the clock passes, and only once (idempotent)", () => {
    let s = fresh();
    // at hour 22, not due
    expect(collectDueEvents(s).find((e) => e.id === "ev_clock_23")).toBeUndefined();
    s = advanceTime(s, 60); // now 23:14
    const due = collectDueEvents(s);
    expect(due.find((e) => e.id === "ev_clock_23")).toBeDefined();

    const step1 = applyWorldEvents(s);
    expect(step1.fired.map((e) => e.id)).toContain("ev_clock_23");
    expect(step1.state.firedEventIds).toContain("ev_clock_23");

    // Re-applying never double-fires.
    const step2 = applyWorldEvents(step1.state);
    expect(step2.fired.length).toBe(0);
    expect(step2.state.firedEventIds).toEqual(step1.state.firedEventIds);
  });

  it("flag-triggered event fires when the flag is set", () => {
    let s = fresh();
    expect(isDue(WORLD_EVENTS.find((e) => e.id === "ev_flag_found_note")!, s)).toBe(false);
    s = { ...s, flags: { ...s.flags, "ep1.found_note": true } };
    expect(isDue(WORLD_EVENTS.find((e) => e.id === "ev_flag_found_note")!, s)).toBe(true);
    const step = applyWorldEvents(s);
    expect(step.fired.map((e) => e.id)).toContain("ev_flag_found_note");
  });

  it("evidence-triggered event fires on discovery", () => {
    let s = fresh();
    s = { ...s, evidenceIds: [...s.evidenceIds, "ev_axe"] };
    const step = applyWorldEvents(s);
    expect(step.fired.map((e) => e.id)).toContain("ev_evidence_axe");
  });

  it("episode-triggered event fires on the matching episode", () => {
    let s = fresh();
    s = { ...s, episodeId: "ep2" };
    const step = applyWorldEvents(s);
    expect(step.fired.map((e) => e.id)).toContain("ev_ep2_arrival");
  });
});

describe("P4 — investigation board payload", () => {
  it("fresh game reports no visible contradictions and canonical-only facts", () => {
    const payload = buildInvestigationPayload(fresh());
    expect(payload.episodeId).toBe("ep1");
    expect(payload.visibleContradictions.length).toBe(0);
    expect(Array.isArray(payload.openLeads)).toBe(true);
  });

  it("discovering the note surfaces the contradiction in the board", () => {
    let s = fresh();
    s = { ...s, evidenceIds: [...s.evidenceIds, "ev_chris_note"] };
    const payload = buildInvestigationPayload(s);
    const hit = payload.visibleContradictions.find((c) => c.factId === "ep1.sarge.chris_argument");
    expect(hit).toBeDefined();
    expect(hit!.claimLabels.length).toBeGreaterThan(0);
  });

  it("corroboration verdicts are epistemic labels, never truth-claims", () => {
    const payload = buildInvestigationPayload(fresh());
    for (const c of payload.corroboration) {
      expect(["corroborated", "contested", "un-corroborated", "canonical-only"]).toContain(c.verdict);
    }
  });
});
