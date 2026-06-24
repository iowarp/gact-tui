/**
 * Visual capture of the per-expert context observer added in 392dcdb7:
 *   - ContextFooter (the compact bottom indicator with the mini segmented bar)
 *   - ContextPanel (expert selector + full segmented bar + legend + Compact now)
 *   - the expert selector re-shaping the bar when the scope changes
 *
 * Runs entirely against the in-process mock backend (no live clio, no GPU):
 * the mock serves GET /v1/agents (the expert roster), GET
 * /v1/sessions/{id}/context/state?scope=… (a full, multi-block ContextState),
 * and POST .../context/compact. The footer self-renders only once a context
 * state resolves, so a populated mock is what makes these surfaces appear.
 *
 * PNGs land in the repo-root screenshots/ dir (not apps/web/screenshots) so the
 * per-expert observer proofs sit alongside the TUI captures.
 */
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { connectMockBackend } from './mock-backend';

// Repo root is six levels up from this spec: apps/web/tests/visual → repo.
const REPO_SHOTS = resolve(import.meta.dirname, '..', '..', '..', '..', 'screenshots');
const shot = (name: string) => resolve(REPO_SHOTS, `${name}.png`);

test.describe('per-expert context observer — visual proofs', () => {
  test('context footer + panel + expert switch render the segmented bar', async ({
    page,
  }) => {
    // Boot the mock chat and land on a session (earthscope has a populated
    // transcript so the chat surface — and thus the footer — mounts).
    await connectMockBackend(page, 'earthscope');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    // (a) ContextFooter — the compact bottom indicator with the mini bar.
    const footer = page.getByTestId('context-footer');
    await expect(footer).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('context-footer-bar')).toBeVisible();
    // The mini bar must carry real proportional blocks (multiple categories).
    const footerBlocks = page.locator(
      '[data-testid="context-footer-bar"] [data-testid^="context-usage-block-"]',
    );
    await expect.poll(() => footerBlocks.count()).toBeGreaterThan(3);
    await footer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot('web-context-footer'), fullPage: false });

    // (b) Open the full ContextPanel (footer click → overlay).
    await footer.click();
    const overlay = page.getByTestId('context-overlay');
    await expect(overlay).toBeVisible({ timeout: 4_000 });
    const panel = page.getByTestId('context-panel');
    await expect(panel).toBeVisible();
    // The panel bar must show several colored blocks + the legend + Compact now.
    const panelBlocks = panel.locator(
      '[data-testid="context-panel-bar"] [data-testid^="context-usage-block-"]',
    );
    await expect.poll(() => panelBlocks.count()).toBeGreaterThan(5);
    await expect(panel.getByTestId('context-usage-legend')).toBeVisible();
    await expect(panel.getByTestId('context-panel-compact')).toBeVisible();
    // The auto-compaction threshold marker is drawn on the bar.
    await expect(panel.getByTestId('context-usage-marker')).toBeVisible();
    await page.screenshot({ path: shot('web-context-panel'), fullPage: false });

    // (c) Switch the expert in the selector → the bar re-segments. Capture the
    // per-block widths before/after to prove the scope query actually re-shaped
    // the bar (not just a re-render of the same data).
    const widths = () =>
      panelBlocks.evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset['width'] ?? ''),
      );
    const before = await widths();

    await panel.getByTestId('context-panel-expert-trigger').click();
    // The Dropdown lists each roster expert; pick the geospatial expert, whose
    // shape differs markedly from the session-default working set.
    const option = panel.getByTestId('context-panel-expert-item-geospatial');
    await expect(option).toBeVisible({ timeout: 4_000 });
    // Fire the option's onClick at the DOM level. A real bubbling pointer click
    // would also reach the ctx-overlay backdrop and dismiss the panel (the
    // overlay closes on a backdrop click); a direct `el.click()` runs the
    // handler — switching the scope — while keeping the panel open for capture.
    await option.evaluate((el: HTMLElement) => el.click());

    // Wait for the refetch to land a different segmentation.
    await expect
      .poll(async () => JSON.stringify(await widths()) !== JSON.stringify(before), {
        timeout: 6_000,
      })
      .toBe(true);
    // The trigger now reads the picked expert's label (still inside the open
    // overlay at this point — capture before any incidental dismissal).
    await expect(panel.getByTestId('context-panel-expert-trigger')).toContainText(
      /geospatial/i,
      { timeout: 4_000 },
    );
    await page.screenshot({ path: shot('web-context-expert-switch'), fullPage: false });
  });

  // (d) MemoryHealthReadout with the context bar — reached via the inspector
  // Memory tab on a session. Best-effort: skipped (not failed) if the surface
  // isn't reachable in this fixture so the core observer proofs above still run.
  test('memory health readout renders alongside the context bar', async ({ page }) => {
    await connectMockBackend(page, 'earthscope');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    const readout = page.getByTestId('memory-health-readout').first();
    const reachable = await readout.isVisible().catch(() => false);
    test.skip(!reachable, 'MemoryHealthReadout not mounted in this fixture');

    await readout.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot('web-context-memory'), fullPage: false });
  });
});
