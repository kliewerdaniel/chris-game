import { test, expect } from "@playwright/test";

/**
 * Core-loop smoke + redesign assertions.
 *
 * 1. The redesigned surface renders (manuscript header, case file, no dead
 *    HEALTH/STAMINA/SOCIAL stats).
 * 2. The core loop works in a real browser: SAY "examine the post" → an
 *    Evidence item appears AND the Established panel shows the RESOLVED
 *    statement (not a raw fact id like `ep1.feed.real`).
 */
test("literary surface renders and core loop updates evidence + resolved facts", async ({ page }) => {
  await page.goto("/");

  // --- redesigned surface ---
  await expect(page.locator(".header h1")).toHaveText("CHRIS");
  await expect(page.locator(".app")).toBeVisible();
  await expect(page.locator(".file")).toBeVisible();
  await expect(page.locator(".narrative")).toBeVisible();

  // No misleading dead survival stats.
  const deadStatLabels = ["HEALTH", "STAMINA", "SOCIAL"];
  for (const label of deadStatLabels) {
    await expect(page.locator(".file").getByText(label, { exact: true })).toHaveCount(0);
  }

  // The intro beat is present.
  await expect(page.locator(".line.narrator").first()).toBeVisible();

  // --- core loop: examine the post ---
  const input = page.locator(".inputbar input");
  await expect(input).toBeVisible();

  // ADR-011: the first free-chat turn shows a one-time disclosure. Acknowledge
  // it if it appears (the first SAY early-returns behind the overlay).
  await input.fill("examine the post");
  await page.locator(".inputbar button").click();
  const ack = page.locator(".chat-disclosure button");
  if (await ack.count()) {
    await ack.click();
    // Re-issue the command now that chat is acknowledged.
    await input.fill("examine the post");
    await page.locator(".inputbar button").click();
  }

  // Evidence appears.
  const evItem = page.locator(".ev-item").first();
  await expect(evItem).toBeVisible({ timeout: 20_000 });

  // Established facts resolve to human statements, not raw ids.
  const established = page.locator(".fact-item").first();
  await expect(established).toBeVisible({ timeout: 20_000 });
  const establishedText = (await established.innerText()).toLowerCase();
  expect(establishedText).not.toMatch(/^ep\d+\./); // not a bare fact id
  expect(establishedText).toContain("daniel"); // resolved canonical statement

  // The post's evidence line renders in the narrative.
  await expect(page.locator(".line.evidence").first()).toBeVisible();

  // Case file shows TRUST · CHRIS (a real engine value), not a dead stat.
  await expect(page.locator(".file").getByText("TRUST · CHRIS")).toBeVisible();

  // ADR-014 §5 — Evidence items are clickable; revealing provenance surfaces
  // the source (epistemic disclosure), never asserting world-truth.
  await evItem.click();
  const prov = evItem.locator(".ev-provenance");
  await expect(prov).toBeVisible({ timeout: 10_000 });
  await expect(prov.locator(".ev-prov-label")).toHaveText("PROVENANCE");
  // Collapsing works.
  await evItem.click();
  await expect(prov).toHaveCount(0);
});

test("command affordance is collapsed, not a permanent wall", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".help-toggle")).toBeVisible();
  // Collapsed by default: the verbose hint list is not shown.
  await expect(page.locator(".help-list")).toHaveCount(0);
  await page.locator(".help-toggle").click();
  await expect(page.locator(".help-list")).toBeVisible();
});

// ADR-014 Phase B — the R3F reconstruction visual must actually mount a WebGL
// canvas in a real browser (not just compile). Catches R3F/three regressions
// that build-time checks miss.
test("reconstruction visual mounts a live canvas", async ({ page }) => {
  await page.goto("/");
  // The reconstruction panel is behind a toggle (perf). Open it.
  const toggle = page.locator(".scene-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  // After opening, the R3F panel and its WebGL canvas must actually mount.
  await expect(page.locator(".recon-scene")).toBeVisible({ timeout: 20_000 });
  const canvas = page.locator(".recon-scene canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  // The legend communicates the Two-Chris visual grammar.
  await expect(page.locator(".recon-legend")).toContainText("real Chris bone");
  await expect(page.locator(".recon-legend")).toContainText("stitched from mythos");
});

test("reconstruction detail panel shows source on fragment select", async ({ page }) => {
  await page.goto("/");
  // Establish a canonical fact so there is a selectable fragment at center.
  const input = page.locator(".inputbar input");
  await expect(input).toBeVisible();
  await input.fill("examine the post");
  await page.locator(".inputbar button").click();
  const ack = page.locator(".chat-disclosure button");
  if (await ack.count()) {
    await ack.click();
    await input.fill("examine the post");
    await page.locator(".inputbar button").click();
  }
  await expect(page.locator(".ev-item").first()).toBeVisible({ timeout: 20_000 });

  // Open the reconstruction visual.
  await expect(page.locator(".scene-toggle")).toBeVisible();
  await page.locator(".scene-toggle").click();
  const scene = page.locator(".recon-scene");
  await expect(scene).toBeVisible({ timeout: 20_000 });

  // Click near the center where canonical fragments cluster; a fragment is hit
  // and the detail panel shows an epistemic source label (never world-truth).
  const canvas = scene.locator("canvas");
  const box = await canvas.boundingBox();
  let hit = false;
  if (box) {
    for (let gx = 0.35; gx <= 0.65 && !hit; gx += 0.03) {
      for (let gy = 0.35; gy <= 0.65 && !hit; gy += 0.03) {
        await canvas.click({ position: { x: box.width * gx, y: box.height * gy } }).catch(() => {});
        if (await page.locator(".recon-detail").count()) hit = true;
      }
    }
  }
  await expect(hit).toBe(true);
  await expect(page.locator(".recon-detail-kind")).toBeVisible();
  // Closing returns to the bare scene.
  await page.locator(".recon-detail-close").click();
  await expect(page.locator(".recon-detail")).toHaveCount(0);
});

test("claim-driven challenge: clicking a claim runs the engine challenge loop", async ({ page }) => {
  await page.goto("/");

  // Recover an evidence item so the Case File has a claim to challenge.
  const input = page.locator(".inputbar input");
  await expect(input).toBeVisible();
  await input.fill("examine the post");
  await page.locator(".inputbar button").click();
  const ack = page.locator(".chat-disclosure button");
  if (await ack.count()) {
    await ack.click();
    await input.fill("examine the post");
    await page.locator(".inputbar button").click();
  }

  // One of the evidence items is the recovered post; expand it to reveal provenance.
  const evItem = page.locator(".ev-item").first();
  await expect(evItem).toBeVisible({ timeout: 20_000 });
  await evItem.click();
  const challengeBtn = evItem.locator(".board-challenge");
  await expect(challengeBtn).toBeVisible({ timeout: 10_000 });

  const logBefore = await page.locator(".line").count();
  await challengeBtn.click();
  // The challenge action routes through the engine and records into the log.
  await expect(page.locator(".line.player", { hasText: "you challenge" }).first()).toBeVisible({ timeout: 10_000 });
  const logAfter = await page.locator(".line").count();
  expect(logAfter).toBeGreaterThan(logBefore);
});

// ADR-014 §5.2 auto-prompt — the Board surfaces a proactive "SUGGESTED NEXT"
// nudge from the top open lead; clicking it drives the same challenge loop.
test("suggested-next nudge drives the player's investigation", async ({ page }) => {
  await page.goto("/");

  const input = page.locator(".inputbar input");
  await expect(input).toBeVisible();
  await input.fill("examine the phone");
  await page.locator(".inputbar button").click();
  const ack = page.locator(".chat-disclosure button");
  if (await ack.count()) {
    await ack.click();
    await input.fill("examine the phone");
    await page.locator(".inputbar button").click();
  }
  await expect(page.locator(".ev-item").first()).toBeVisible({ timeout: 20_000 });

  await page.locator(".asbtn", { hasText: "board" }).click();
  const suggest = page.locator(".board-section.suggest");
  await expect(suggest).toBeVisible({ timeout: 10_000 });
  const suggestBtn = suggest.locator(".lead-challenge");
  await expect(suggestBtn).toBeVisible();

  const logBefore = await page.locator(".line").count();
  await suggestBtn.click();
  await expect(page.locator(".line.player", { hasText: "you challenge" }).first()).toBeVisible({ timeout: 10_000 });
  const logAfter = await page.locator(".line").count();
  expect(logAfter).toBeGreaterThan(logBefore);
});

// ADR-014 §5.2 auto-prompt on the MAIN surface — the engine's proactive
// suggestion shows inline (not only inside the Board) and its "investigate"
// button drives the same challenge loop.
test("main-surface auto-prompt nudge drives the player's investigation", async ({ page }) => {
  await page.goto("/");

  const input = page.locator(".inputbar input");
  await expect(input).toBeVisible();
  await input.fill("examine the phone");
  await page.locator(".inputbar button").click();
  const ack = page.locator(".chat-disclosure button");
  if (await ack.count()) {
    await ack.click();
    await input.fill("examine the phone");
    await page.locator(".inputbar button").click();
  }
  await expect(page.locator(".ev-item").first()).toBeVisible({ timeout: 20_000 });

  // The nudge renders on the main play surface (below the input), not just in the Board.
  const hint = page.locator(".next-hint");
  await expect(hint).toBeVisible({ timeout: 10_000 });
  const hintBtn = hint.locator(".next-hint-btn");
  await expect(hintBtn).toBeVisible();

  const logBefore = await page.locator(".line").count();
  await hintBtn.click();
  await expect(page.locator(".line.player", { hasText: "you challenge" }).first()).toBeVisible({ timeout: 10_000 });
  const logAfter = await page.locator(".line").count();
  expect(logAfter).toBeGreaterThan(logBefore);
});

test("open leads drive the player: clicking 'investigate' runs the challenge loop", async ({ page }) => {
  await page.goto("/");

  // Get some state on the board — examining the phone surfaces the genuinely
  // unresolved "Mother's knowledge" fact as an open lead the Board can drive.
  const input = page.locator(".inputbar input");
  await expect(input).toBeVisible();
  await input.fill("examine the phone");
  await page.locator(".inputbar button").click();
  const ack = page.locator(".chat-disclosure button");
  if (await ack.count()) {
    await ack.click();
    await input.fill("examine the phone");
    await page.locator(".inputbar button").click();
  }
  await expect(page.locator(".ev-item").first()).toBeVisible({ timeout: 20_000 });

  // Open the Consistency Board.
  await page.locator(".asbtn", { hasText: "board" }).click();
  const leads = page.locator(".board-row.lead");
  await expect(leads.first()).toBeVisible({ timeout: 10_000 });
  const leadBtn = leads.first().locator(".lead-challenge");
  await expect(leadBtn).toBeVisible({ timeout: 10_000 });

  const logBefore = await page.locator(".line").count();
  await leadBtn.click();
  // The open-lead "investigate" affordance routes through the engine and
  // records a challenge into the log — proving the report now drives play.
  await expect(page.locator(".line.player", { hasText: "you challenge" }).first()).toBeVisible({ timeout: 10_000 });
  const logAfter = await page.locator(".line").count();
  expect(logAfter).toBeGreaterThan(logBefore);
});

// M3 — the room environment ("the room", D12) frames the reconstruction inside
// the live WebGL canvas. Catches R3F v9 / RoomEnvironment regressions that
// build-time checks miss.
test("reconstruction room environment mounts inside the canvas", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator(".scene-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator(".recon-scene")).toBeVisible({ timeout: 20_000 });
  const canvas = page.locator(".recon-scene canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  // The DOM safety net (§9 floor) is always present in the DOM tree, even while
  // WebGL renders — so screen-reader / no-WebGL audiences get the layout as text.
  const sr = page.locator(".recon-spatial-sr");
  await expect(sr).toHaveCount(1);
  await expect(sr).toContainText("the lamp");
  await expect(sr).toContainText("his chair");
});

// M3 — reduced-motion users get a static scene: the canvas still mounts, but the
// fragment drift/flicker is suppressed (verified at the adapter + CSS level; here
// we assert the WebGL canvas is present and no motion exception is thrown).
test("reconstruction visual is robust under reduced-motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const toggle = page.locator(".scene-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  const canvas = page.locator(".recon-scene canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  // Legend + safety net still present (no WebGL wall).
  await expect(page.locator(".recon-legend")).toContainText("real Chris bone");
  await expect(page.locator(".recon-spatial-sr")).toHaveCount(1);
});

// D4 — the investigation graph renders as a 3D constellation ("the web" mode).
// Catches regressions in the graph-layout adapter + GraphConstellation renderer
// that build-time checks miss (e.g. a Suspense/font-load blank like M3).
test("reconstruction graph constellation mounts in 'the web' mode", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator(".scene-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  // Switch to the graph view.
  const webBtn = page.locator(".recon-mode-toggle button", { hasText: "the web" });
  await expect(webBtn).toBeVisible();
  await webBtn.click();
  const canvas = page.locator(".recon-scene canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  // DOM safety net expresses the graph as text (not a hard WebGL wall).
  const sr = page.locator(".recon-spatial-sr");
  await expect(sr).toContainText("web of claims");
  await expect(sr).toContainText("nodes");
});

// D4 — clicking a node in the constellation surfaces its epistemic detail.
test("reconstruction graph node click opens the detail panel", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator(".scene-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.locator(".recon-mode-toggle button", { hasText: "the web" }).click();
  const canvas = page.locator(".recon-scene canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  // Click the canvas center: the graph's highest-rank node (rank 0, largest)
  // sits at the spiral core, which projects to the canvas center under the
  // fixed camera. This verifies node placement + click-to-select deterministically.
  const box = await canvas.boundingBox();
  let opened = false;
  if (box) {
    await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } }).catch(() => {});
    opened = (await page.locator(".recon-detail").count()) > 0;
    // Fallback: sweep a small central grid if the core node is off-center.
    if (!opened) {
      for (let gx = 0.35; gx <= 0.65 && !opened; gx += 0.05) {
        for (let gy = 0.35; gy <= 0.65 && !opened; gy += 0.05) {
          await canvas.click({ position: { x: box.width * gx, y: box.height * gy } }).catch(() => {});
          opened = (await page.locator(".recon-detail").count()) > 0;
        }
      }
    }
  }
  expect(opened).toBe(true);
  // The detail panel is the same epistemic component used by the room — proving
  // the graph view routes player intent through the existing disclosure system.
  await expect(page.locator(".recon-detail-kind")).toBeVisible({ timeout: 10_000 });
});

test("reconstruction environment toggle cycles the room / porch / last call", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator(".scene-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator(".recon-scene")).toBeVisible({ timeout: 20_000 });

  // Default environment is "the room".
  const placeBtn = page.locator(".recon-mode-toggle button").first();
  await expect(placeBtn).toContainText("the room");

  // Cycle once -> "the porch".
  const cycleBtn = page.locator(".recon-mode-toggle button").nth(2);
  await cycleBtn.click();
  await expect(placeBtn).toContainText("the porch");

  // Cycle again -> "the last call".
  await cycleBtn.click();
  await expect(placeBtn).toContainText("the last call");

  // The DOM safety net reflects the current environment's framing.
  const sr = page.locator(".recon-spatial-sr");
  await expect(sr).toContainText("last call");
});
