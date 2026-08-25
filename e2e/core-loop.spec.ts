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
});

test("command affordance is collapsed, not a permanent wall", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".help-toggle")).toBeVisible();
  // Collapsed by default: the verbose hint list is not shown.
  await expect(page.locator(".help-list")).toHaveCount(0);
  await page.locator(".help-toggle").click();
  await expect(page.locator(".help-list")).toBeVisible();
});
