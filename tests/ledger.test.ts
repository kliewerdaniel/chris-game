import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Ledger, statusClass, statusLabel } from "../components/GameShell";

describe("Epistemic Ledger (ADR-013)", () => {
  it("renders an empty state when nothing is established", () => {
    const html = renderToStaticMarkup(h(Ledger, { established: [] }));
    expect(html).toContain("No facts established yet.");
  });

  it("renders each established fact with its statement, status chip, and provenance source", () => {
    const established = ["ep1.feed.real", "ep1.she", "ep4.rec.is_chris"];
    const html = renderToStaticMarkup(h(Ledger, { established }));
    // canonical fact: statement + CANONICAL chip + reddit provenance
    expect(html).toContain("Daniel built an AI reconstruction of his dead friend Chris");
    expect(html).toContain(`status-tag ${statusClass("canonical")}`);
    expect(html).toContain("I created a monster");
    // unknown fact keeps its UNKNOWN chip (honest unresolved thread)
    expect(html).toContain(`status-tag ${statusClass("unknown")}`);
    expect(html).toContain("She did not kill him");
    // reconstruction-claimed fact surfaces its testimony chip + in-voice provenance
    expect(html).toContain(`status-tag ${statusClass("testimony")}`);
    expect(html).toContain("The reconstruction (in-voice)");
  });

  it("status label is the uppercase word (color is never the only signal)", () => {
    expect(statusLabel("canonical")).toBe("CANONICAL");
    expect(statusLabel("testimony")).toBe("TESTIMONY");
    expect(statusLabel("unknown")).toBe("UNKNOWN");
  });
});
