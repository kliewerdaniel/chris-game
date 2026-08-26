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
