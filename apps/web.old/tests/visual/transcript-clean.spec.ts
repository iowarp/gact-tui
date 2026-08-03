/**
 * Visual + structural proof that the ASSISTANT transcript renders the saved
 * REAL clio run (earthscope-real-trace.json — the post-#880/#881 clean
 * presentation-model wire, session sess_f81710c00d95) VERBATIM, the way the TUI
 * does. This pins the NEW contract (epic #880): every client-side dedup/scrub was
 * DELETED, so the render must reflect exactly what the server emits —
 *   - each delegation is minted ONCE (one delegate.started header + one
 *     delegate.completed return per delegation); NO dedup, NO "collapse the twin";
 *   - the 10 real delegations of the LA GNSS pipeline render in wire order, each
 *     depth-indented by the delegation graph (children one level below the parent);
 *   - the model's prose renders VERBATIM, including the sentence that legitimately
 *     references `workflow_state` (owner-approved content the OLD world scrubbed);
 *   - a completed return's show-more discloses the child's parent-bound `output`
 *     byte-for-byte (a bare JSON body is legitimate);
 *   - tool output is content-typed (CSV → table, plot png → inline image), and
 *     only tool output collapses.
 *
 * Grounded line-by-line in apps/web/CANONICAL-CONVERSATION.md's grammar.
 *
 * Run:
 *   cd apps && CLIO_NDP_EARTHSCOPE_LIVE=0 \
 *     pnpm --filter @clio/web exec playwright test transcript-clean --reporter=list
 */
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { connectMockBackend } from './mock-backend';

const REPO_SHOT = resolve(import.meta.dirname, '..', '..', '..', '..', 'screenshots');

// The 10 delegations the clean wire actually carries, in arrival order. Each is
// minted EXACTLY ONCE (a delegate.started header); the structural parent.resumed
// twins never render. Derived from the fixture, not invented.
const DELEGATIONS: ReadonlyArray<{ child: string; depth: string }> = [
  { child: 'geospatial', depth: '0' }, //                 main → geospatial
  { child: 'data', depth: '0' }, //                       main → data
  { child: 'ndp_dataset_discovery', depth: '1' }, //      data → ndp_dataset_discovery
  { child: 'earthscope_station_catalog', depth: '1' }, // data → earthscope_station_catalog
  { child: 'ndp_resource_resolver', depth: '1' }, //      data → ndp_resource_resolver
  { child: 'analysis', depth: '0' }, //                   main → analysis
  { child: 'gnss_timeseries_analysis', depth: '1' }, //   analysis → gnss_timeseries_analysis
  { child: 'station_network_analysis', depth: '1' }, //   analysis → station_network_analysis
  { child: 'visualization', depth: '0' }, //              main → visualization
  { child: 'synthesis', depth: '0' }, //                  main → synthesis
];

test.describe('clean transcript — real earthscope trace', () => {
  test('renders the verbatim, once-minted, depth-indented post-#880 delegation flow', async ({
    page,
  }) => {
    await connectMockBackend(page, 'earthscope-real');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    const turn = page.getByTestId('assistant-turn');
    await expect(turn).toBeVisible();

    // ONCE-MINTED (NO DEDUP): the wire carries 10 delegate.started + 10
    // delegate.completed + 10 structural parent.resumed handoffs. The render shows
    // exactly ONE header per delegation (10 steps) and ONE return per delegation
    // (10 returns); the parent.resumed twins never render — not because the client
    // collapses them, but because they are structural and carry no delegation to a
    // NEW child (epic #880: verbatim render of a stream the server already cleaned).
    const steps = page.getByTestId('assistant-turn-step');
    await expect(steps).toHaveCount(DELEGATIONS.length);
    await expect(page.getByTestId('assistant-turn-return')).toHaveCount(DELEGATIONS.length);
    // One delegation HEADER per step (no doubled header for the completed twin).
    await expect(page.getByTestId('assistant-turn-delegation-header')).toHaveCount(
      DELEGATIONS.length,
    );

    // The 10 delegations render in wire order, each header naming its child and
    // sitting at its delegation-graph depth (main-rooted = 0; a child of `data`
    // or `analysis` = 1). This is the exact set the fixture carries.
    for (let i = 0; i < DELEGATIONS.length; i++) {
      const { child, depth } = DELEGATIONS[i]!;
      const step = steps.nth(i);
      await expect(step.getByTestId('assistant-turn-delegation-header')).toContainText(child);
      await expect(step).toHaveAttribute('data-depth', depth);
    }

    // CHAT-OF-TURNS structure on the first block (main → geospatial): the header
    // names the child, the task line is the parent's VERBATIM instruction, and
    // `main` shows as a colored owner header for its own turn.
    const firstBlock = steps.first();
    await expect(firstBlock.getByTestId('assistant-turn-delegation-header')).toContainText(
      'geospatial',
    );
    // `main` renders as a colored owner header (the name span may be followed by
    // its collapsed provider-thinking disclosure, so match the typed data-agent).
    await expect(
      page.locator('[data-testid="assistant-turn-agent"][data-agent="main"]').first(),
    ).toBeVisible();
    // The call-row task = the instruction main sent geospatial, verbatim.
    await expect(firstBlock.getByTestId('assistant-turn-task')).toContainText(
      'grounded geographic region',
    );

    // TOOL, content-typed and depth-indented under its owning expert. geospatial
    // runs geo_geocode; the REAL result (resolved lat) renders inline — proving the
    // observation is shown, not a `N items` count — and a short json result invents
    // no `show raw` toggle. geospatial is a child of main, so its tool sits at depth 1.
    const geoTool = turn.getByTestId('assistant-turn-tool').filter({ hasText: 'geo_geocode' }).first();
    await expect(geoTool).toContainText('geo_geocode');
    // 34.0536909 appears only in the RESULT (not the args), so this proves the
    // real observation renders through the content-type path.
    await expect(geoTool).toContainText('34.0536909');
    await expect(geoTool.getByTestId('tool-raw-toggle')).toHaveCount(0);
    await expect(geoTool).toHaveAttribute('data-depth', '1');

    // DEPTH / RECURSION: data → ndp_dataset_discovery is a delegation of `data`
    // (depth 1); ndp's own tool (ndp_search_datasets) indents one level DEEPER
    // (depth 2). Prove both the data-depth attribute AND the visual offset.
    const ndpStep = steps
      .filter({ has: page.getByTestId('assistant-turn-delegation-header') })
      .filter({ hasText: 'ndp_dataset_discovery' })
      .first();
    await expect(ndpStep).toHaveAttribute('data-depth', '1');
    const ndpTool = turn
      .getByTestId('assistant-turn-tool')
      .filter({ hasText: 'ndp_search_datasets' })
      .first();
    await expect(ndpTool).toHaveAttribute('data-depth', '2');
    const ndpStepBox = await ndpStep.boundingBox();
    const ndpToolBox = await ndpTool.boundingBox();
    expect(ndpStepBox).not.toBeNull();
    expect(ndpToolBox).not.toBeNull();
    expect(ndpToolBox!.x).toBeGreaterThan(ndpStepBox!.x + 12);

    // RETURN contract: `↩ geospatial returns to main` collapses to a one-liner; its
    // `show more` discloses the child's parent-bound `output` BYTE-FOR-BYTE — here a
    // bare JSON region body — rendered verbatim, not a server-authored summary.
    const firstReturnToggle = turn.getByTestId('assistant-turn-return-toggle').first();
    await expect(firstReturnToggle).toBeVisible();
    await firstReturnToggle.click();
    const firstReturnBody = turn.getByTestId('assistant-turn-return-body').first();
    await expect(firstReturnBody).toBeVisible();
    // Verbatim child output: the geospatial region JSON (region_name / osm_nominatim).
    await expect(firstReturnBody).toContainText('region_name');
    await expect(firstReturnBody).toContainText('osm_nominatim');

    // VERBATIM MODEL PROSE SURVIVES (the crux of epic #880). The model legitimately
    // references the typed `workflow_state` in its prose — owner-approved content the
    // OLD world scrubbed. Its PRESENCE is the point: no client scrub rewrites it.
    const body = page.getByTestId('transcript-pane');
    await expect(body).toContainText('workflow_state');

    // NO STAGE-ENUM LEAKAGE: the structural lifecycle stage strings are wire
    // vocabulary, never rendered as prose (the grammar shows `call(child)` /
    // `returns to`, never the dotted enum). This is a render-grammar guarantee,
    // NOT a dedup/scrub of model text.
    await expect(body).not.toContainText('delegate.started');
    await expect(body).not.toContainText('delegate.completed');
    await expect(body).not.toContainText('parent.resumed');

    // ROUTING plumbing is suppressed (the low-level routing_decision chips are not
    // the orchestrator's decision — the delegation header is). None render.
    await expect(page.getByTestId('assistant-turn-routing')).toHaveCount(0);

    // CONTENT TYPING: pandas_profile_csv returns a structured profile carrying
    // `columns[]` + `dtypes` — content-typed as a TABLE (the GNSS displacement
    // columns), not a raw JSON envelope. This is the clean tabular result in the
    // capture. (The Windows shell catalog result arrives double-wrapped in a
    // truncation envelope whose inner JSON is malformed by the `type "path"`
    // command's quotes, so it renders verbatim as JSON, not a CSV table — see the
    // report's findings; that is a backend capture shape, not a client defect.)
    const profileTable = page
      .getByTestId('tool-table')
      .filter({ hasText: 'time' })
      .filter({ hasText: 'east' })
      .first();
    await expect(profileTable).toBeVisible();
    await expect(profileTable).toContainText('north');
    await expect(profileTable).toContainText('up');

    // The final answer renders prominently as markdown. It is `main`'s closing
    // pipeline summary (the last text row), listing every stage and — verbatim —
    // the `workflow_state` sentence.
    const answer = page.getByTestId('assistant-turn-answer');
    await expect(answer).toBeVisible();
    await expect(answer).toContainText('geospatial');
    await expect(answer).toContainText('synthesis');
    await expect(answer).toContainText('MTA1');
    await expect(answer).toContainText('workflow_state');

    // Scroll the transcript to the top so the user prompt and the depth-indented
    // delegation steps are in view for the primary screenshot.
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

    // ---- LIVE TOOLS: semantic result preview, not a raw envelope ------------
    // pandas_profile_csv returns a structured profile — the renderer content-types
    // it into a TABLE of the real GNSS columns (time / east / north / up …) with
    // their dtypes, exactly like the TUI, rather than dumping the JSON blob.
    await connectMockBackend(page, 'earthscope-real');
    await expect(page.getByTestId('assistant-turn')).toBeVisible();
    const profileToolLive = page
      .getByTestId('assistant-turn-tool')
      .filter({ hasText: 'pandas_profile_csv' })
      .first();
    await profileToolLive.scrollIntoViewIfNeeded();
    const profileTableLive = profileToolLive.getByTestId('tool-table').first();
    await expect(profileTableLive).toContainText('time');
    await expect(profileTableLive).toContainText('east');
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
    // It is a real raster image with non-zero dimensions (not a JSON dump). The
    // <img loading="lazy"> decodes asynchronously, so wait for the raster to load
    // (naturalHeight > 0) before measuring its laid-out box.
    await expect
      .poll(() => plotImg.evaluate((el) => (el as HTMLImageElement).naturalHeight), {
        timeout: 8_000,
      })
      .toBeGreaterThan(0);
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

    // Scroll to the BOTTOM so the final `text` answer fills the viewport — proves
    // it renders as clean prominent markdown, not a fenced code/box dump.
    await answer.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const a = document.querySelector('[data-testid="assistant-turn-answer"]');
      a?.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(300);
    // The answer's markdown actually rendered (the per-stage bulleted list), not a
    // literal `**asterisks**` / fenced dump.
    await expect(answer.locator('.im li').first()).toBeVisible();
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
    // data -> ndp_dataset_discovery at 1. This fixture only carries the two
    // delegation edges, so the geometry assertion below checks the actual
    // rendered rows instead of requiring a synthetic child return row.
    const parent = steps.filter({ hasText: 'data' }).first();
    const child = steps.filter({ hasText: 'ndp_dataset_discovery' }).first();
    await expect(parent).toHaveAttribute('data-depth', '0');
    await expect(child).toHaveAttribute('data-depth', '1');
    // PROVE the visual offset: the child's left edge is measurably further right
    // than the parent's — not merely a "← parent" label.
    const parentBox = await parent.boundingBox();
    const childBox = await child.boundingBox();
    expect(parentBox).not.toBeNull();
    expect(childBox).not.toBeNull();
    expect(childBox!.x).toBeGreaterThan(parentBox!.x + 18);

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
    await expect(page.getByTestId('trx-image-thumb-hint')).toContainText('show full image');
    const frame = thumb.locator('.trx-image-frame');
    const before = await frame.boundingBox();
    await thumb.click();
    await page.waitForTimeout(250);
    const after = await frame.boundingBox();
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
