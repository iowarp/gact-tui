/**
 * Visual + structural proof that the ASSISTANT transcript renders the saved
 * REAL clio run (earthscope-real-trace.json) the way the TUI does: deduped
 * delegations, no workflow_state JSON, depth-indented steps, compacted tool /
 * long content with an expand affordance, and a prominent final answer.
 *
 * Run:
 *   cd apps && CLIO_NDP_EARTHSCOPE_LIVE=0 \
 *     pnpm --filter @clio/web exec playwright test transcript-clean --reporter=list
 */
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { connectMockBackend } from './mock-backend';

const REPO_SHOT = resolve(import.meta.dirname, '..', '..', '..', '..', 'screenshots');

test.describe('clean transcript — real earthscope trace', () => {
  test('renders deduped, depth-indented, scaffolding-free delegation flow', async ({ page }) => {
    await connectMockBackend(page, 'earthscope-real');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    const turn = page.getByTestId('assistant-turn');
    await expect(turn).toBeVisible();

    // DEDUPE: 5 real delegations (each emitted twice on the wire) collapse to
    // exactly 5 steps — no parent.resumed duplicates.
    const steps = page.getByTestId('assistant-turn-step');
    await expect(steps).toHaveCount(5);

    // The five named experts appear, in order.
    for (const agent of ['geospatial', 'data', 'analysis', 'visualization', 'synthesis']) {
      await expect(
        page.locator('[data-testid="assistant-turn-step"]').filter({ hasText: agent }).first(),
      ).toBeVisible();
    }

    // CHAT-OF-TURNS structure: each block surfaces the delegation header
    // (main → expert), the task main SENT, the expert's tool calls, and the
    // expert's markdown result — distinct, ordered, countable.
    const firstBlock = steps.first();
    await expect(firstBlock.getByTestId('assistant-turn-delegation-header')).toContainText(
      'geospatial',
    );
    await expect(page.getByTestId('assistant-turn-agent').filter({ hasText: /^main$/ }).first()).toBeVisible();
    await expect(firstBlock.getByTestId('assistant-turn-task')).toContainText('Resolve Los Angeles');
    const geoTool = turn.getByTestId('assistant-turn-tool').filter({ hasText: 'geo_geocode' }).first();
    // The tool name renders verbatim (no per-tool special-casing).
    await expect(geoTool).toContainText('geo_geocode');
    // The real result is visible inline; short outputs do not get raw toggles.
    await expect(geoTool).toContainText('Los Angeles');
    await expect(geoTool.getByTestId('tool-raw-toggle')).toHaveCount(0);
    await expect(turn.getByTestId('assistant-turn-return-body').first()).toBeVisible();

    // DEPTH: the delegation edge is one of main's turns, so it sits at depth 0;
    // the delegated expert's own tool/return rows sit one level deeper.
    await expect(steps.first()).toHaveAttribute('data-depth', '0');
    await expect(geoTool).toHaveAttribute('data-depth', '1');

    // STRIP: no workflow_state JSON / control scaffolding leaks into the DOM,
    // including the injected evidence-retention markers.
    const body = page.getByTestId('transcript-pane');
    await expect(body).not.toContainText('Retained typed workflow state');
    await expect(body).not.toContainText('CLIO durable typed workflow state');
    await expect(body).not.toContainText('"workflow_state"');
    await expect(body).not.toContainText('delegate.completed');
    await expect(body).not.toContainText('parent.resumed');
    await expect(body).not.toContainText('delegation output truncated');
    await expect(body).not.toContainText('exact retained evidence index');

    // CONTENT TYPING: tables show columns + a few rows instead of raw envelopes;
    // short previews do not invent a raw disclosure.
    await expect(page.getByTestId('tool-table').first()).toBeVisible();

    // The final answer renders prominently as labelled markdown (its sections show).
    const answer = page.getByTestId('assistant-turn-answer');
    await expect(answer).toBeVisible();
    await expect(answer).toContainText('Answer');
    await expect(answer).toContainText('Region');
    await expect(answer).toContainText('Station');

    // Scroll the transcript to the top so the user prompt, routing chip and the
    // depth-indented delegation steps are in view for the primary screenshot.
    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="transcript-pane"]') as HTMLElement | null;
      if (pane) pane.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-transcript-clean.png'),
      fullPage: false,
    });

    // CHAT-OF-TURNS primary proof: expand the first delegation block's task /
    // tool result / result so a single turn shows ALL its structure at once
    // (main → geospatial + task sent + tool call/result + markdown result).
    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="transcript-pane"]') as HTMLElement | null;
      if (pane) pane.scrollTop = 0;
    });
    const block = page.getByTestId('assistant-turn-step').first();
    const blockToggles = block.getByTestId('collapsible-toggle');
    const btCount = await blockToggles.count();
    for (let i = 0; i < btCount; i++) {
      const t = blockToggles.nth(i);
      if (await t.isVisible()) await t.click();
    }
    await block.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const b = document.querySelector('[data-testid="assistant-turn-step"]');
      b?.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-chat-turns.png'),
      fullPage: false,
    });

    // CHAT-OF-TURNS full scroll: reconnect fresh (all blocks compacted) and
    // scroll the inner pane partway so SEVERAL consecutive turn-blocks
    // (main → geospatial / data / analysis …) are visible at once — proving the
    // flowing append-only log of clearly-separated turns, not one monolithic box.
    await connectMockBackend(page, 'earthscope-real');
    await expect(page.getByTestId('assistant-turn')).toBeVisible();
    // Land near the tail so the shorter analysis / visualization / synthesis
    // turn-blocks AND the prominent final markdown answer are visible together —
    // several clearly-separated turns in one frame.
    await page.getByTestId('assistant-turn-answer').scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="transcript-pane"]') as HTMLElement | null;
      if (pane) pane.scrollTop = Math.max(0, pane.scrollTop - 360);
    });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-chat-turns-full.png'),
      fullPage: false,
    });

    // ---- LIVE TOOLS: semantic result preview, not raw JSON ------------------
    // The `data` turn ran 7 tools; its shell `head -5` shows STDOUT (Site,…),
    // never the echoed command, and a "show raw" toggle reveals the full body.
    await connectMockBackend(page, 'earthscope-real');
    await expect(page.getByTestId('assistant-turn')).toBeVisible();
    const shellTool = page
      .getByTestId('assistant-turn-tool')
      .filter({ hasText: 'head -5' })
      .first();
    await shellTool.scrollIntoViewIfNeeded();
    // The shell stdout is CSV → detected as a TABLE by content (not by tool
    // name): the Site / Latitude columns render as a table, not the echoed cmd.
    await expect(shellTool.getByTestId('tool-table')).toContainText('Site');
    await expect(shellTool.getByTestId('tool-table')).toContainText('Latitude');
    await expect(shellTool).not.toContainText('"command"');
    await page.evaluate(() => {
      const el = document
        .querySelectorAll('[data-testid="assistant-turn-step"]')[1] as HTMLElement | null;
      el?.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-live-tools.png'),
      fullPage: false,
    });

    // ---- LIVE IMAGE: the plot output_path renders as an inline image --------
    const vizTool = page.getByTestId('assistant-turn-tool').filter({ hasText: 'plot_plot_timeseries' }).first();
    await vizTool.scrollIntoViewIfNeeded();
    const plotImg = vizTool.getByTestId('trx-image').first();
    await expect(plotImg).toBeVisible({ timeout: 8_000 });
    // It is a real raster image with non-zero dimensions (not a JSON dump).
    const imgBox = await plotImg.boundingBox();
    expect(imgBox).not.toBeNull();
    expect(imgBox!.height).toBeGreaterThan(40);
    await page.evaluate(() => {
      const blocks = document.querySelectorAll('[data-testid="assistant-turn-step"]');
      (blocks[blocks.length - 2] as HTMLElement | undefined)?.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-live-image.png'),
      fullPage: false,
    });

    // Expand everything and capture the fully-disclosed view (scrolled to top).
    const toggles = page.getByTestId('collapsible-toggle');
    const count = await toggles.count();
    for (let i = 0; i < count; i++) {
      const t = toggles.nth(i);
      if (await t.isVisible()) await t.click();
    }
    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="transcript-pane"]') as HTMLElement | null;
      if (pane) pane.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-transcript-clean-expanded.png'),
      fullPage: false,
    });

    // Scroll to the BOTTOM so the final synthesis `text` answer fills the
    // viewport — proves it renders as clean prominent markdown (headings,
    // links, CSV-path chip), not a code/box dump.
    await answer.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const a = document.querySelector('[data-testid="assistant-turn-answer"]');
      a?.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(300);
    // The answer's markdown headings actually rendered (not a fenced code dump),
    // and the "Answer" headline label is present and distinct.
    await expect(answer.locator('.im__h-2, .im__h-1').first()).toBeVisible();
    await expect(answer).toContainText('Answer');
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-transcript-clean-answer.png'),
      fullPage: false,
    });
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-live-answer.png'),
      fullPage: false,
    });
  });

  test('nested 2-level chain indents the child one level deeper than its parent', async ({
    page,
  }) => {
    await connectMockBackend(page, 'nested-depth');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    const steps = page.getByTestId('assistant-turn-step');
    await expect(steps).toHaveCount(2);

    // Delegation edges render at the parent's depth: main -> data at 0, then
    // data -> ndp_dataset_discovery at 1. The child's own turn indents to 2.
    const parent = steps.filter({ hasText: 'data' }).first();
    const child = steps.filter({ hasText: 'ndp_dataset_discovery' }).first();
    await expect(parent).toHaveAttribute('data-depth', '0');
    await expect(child).toHaveAttribute('data-depth', '1');
    await expect(
      page.locator('[data-testid="assistant-turn-return"][data-agent="ndp_dataset_discovery"]').first(),
    ).toHaveAttribute('data-depth', '2');

    // PROVE the visual offset: the child's left edge is measurably further right
    // than the parent's — not merely a "← parent" label.
    const parentBox = await parent.boundingBox();
    const childBox = await child.boundingBox();
    expect(parentBox).not.toBeNull();
    expect(childBox).not.toBeNull();
    expect(childBox!.x).toBeGreaterThan(parentBox!.x + 8);

    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="transcript-pane"]') as HTMLElement | null;
      if (pane) pane.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-transcript-nested-indent.png'),
      fullPage: false,
    });
  });

  test('image enlarges; long markdown + diff render flat and in full', async ({ page }) => {
    await connectMockBackend(page, 'transcript-artifacts');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    // (a) image renders as a capped thumbnail with a click-to-enlarge hint.
    const thumb = page.getByTestId('trx-image-thumb');
    await expect(thumb).toBeVisible();
    await expect(page.getByTestId('trx-image')).toBeVisible();
    await expect(page.getByTestId('trx-image-thumb-hint')).toContainText('enlarge');
    const before = await page.getByTestId('trx-image').boundingBox();
    await thumb.click();
    await page.waitForTimeout(250);
    const after = await page.getByTestId('trx-image').boundingBox();
    // Enlarging actually grows the image.
    expect(after!.height).toBeGreaterThan(before!.height);
    await thumb.click(); // shrink back for the screenshot
    await page.waitForTimeout(250);

    // (b) the long markdown answer renders IN FULL (model text never collapses):
    // its last methodology step is present, not hidden behind an expand toggle.
    const answer = page.getByTestId('assistant-turn-answer');
    await expect(answer).toContainText('Step 20');

    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="transcript-pane"]') as HTMLElement | null;
      if (pane) pane.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-transcript-artifacts.png'),
      fullPage: false,
    });
  });
});
