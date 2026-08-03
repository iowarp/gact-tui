/**
 * Visual + interaction proof for the #305 WORKFLOW-CONTRACT ICON — the owner's
 * one glyph in the delegation flow that reveals the otherwise-invisible typed
 * `workflow_state`. Grounded in the REAL post-#880 EarthScope trace fixture
 * (earthscope-real-trace.json), which carries a non-empty workflow_state on all
 * 10 delegate.completed (return) rows and on ZERO delegate.started (call) rows —
 * so the icon renders on returns and, structurally, not on calls (today's wire).
 *
 * Proves:
 *   - the document icon renders on RETURN rows that carry state, and is ABSENT on
 *     call rows (the started rows in this fixture have no state — degrade to none);
 *   - HOVER shows a popup titled with the direction + child, listing the real
 *     state (a genuine fixture key — 'osm_nominatim' / 'acquisition');
 *   - the popup content is the row's typed state BYTE-FOR-BYTE (pretty-printed);
 *   - CLICK pins the popup (X visible); X closes it; Esc closes it.
 *
 * Run:
 *   cd apps && CLIO_NDP_EARTHSCOPE_LIVE=0 \
 *     pnpm --filter @clio/web exec playwright test workflow-contract-icon --reporter=list
 */
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import trace from './fixtures/earthscope-real-trace.json' with { type: 'json' };
import { connectMockBackend } from './mock-backend';

const REPO_SHOT = resolve(import.meta.dirname, '..', '..', '..', '..', 'screenshots');

/** The typed workflow_state the FIRST completed delegation (geospatial → main)
 *  carries on the wire — the exact object the first return row's icon must show,
 *  read from the fixture, not invented. */
function firstCompletedWorkflowState(): Record<string, unknown> {
  for (const msg of trace.messages as Array<{ parts?: Array<Record<string, unknown>> }>) {
    for (const part of msg.parts ?? []) {
      if (part['type'] !== 'expert_handoff') continue;
      const md = (part['metadata'] ?? {}) as Record<string, unknown>;
      const stage = (part['stage'] as string) ?? (md['stage'] as string);
      if (stage === 'delegate.completed' && part['child_agent'] === 'geospatial') {
        return md['workflow_state'] as Record<string, unknown>;
      }
    }
  }
  throw new Error('fixture missing a geospatial delegate.completed workflow_state');
}

test.describe('#305 workflow-contract icon on delegation rows', () => {
  test('renders on return rows with state, absent on call rows, hover→popup, click→pin, X/Esc close', async ({
    page,
  }) => {
    await connectMockBackend(page, 'earthscope-real');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('assistant-turn')).toBeVisible();

    // The fixture carries workflow_state on all 10 completed returns and none on the
    // started calls. The icon count matches the delegation-return count (10), all
    // tagged direction="return"; there are ZERO call-direction icons (the started
    // rows have no state on today's wire → the icon degrades to nothing).
    const returnIcons = page.locator('[data-testid="workflow-contract-icon"][data-direction="return"]');
    await expect(returnIcons).toHaveCount(10);
    await expect(page.getByTestId('assistant-turn-return')).toHaveCount(10);
    await expect(
      page.locator('[data-testid="workflow-contract-icon"][data-direction="call"]'),
    ).toHaveCount(0);

    // The icon sits on the FIRST return (geospatial returns to main). Hover it →
    // the popup appears, titled with the RETURN direction (`←`) and the child name.
    const firstIcon = returnIcons.first();
    // Center the icon so the downward-opening popup (and its X button) has room in
    // the viewport for the later click interactions.
    await firstIcon.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await firstIcon.hover();
    const popup = page.getByTestId('workflow-contract-popup');
    await expect(popup).toBeVisible();
    await expect(page.getByTestId('workflow-contract-title')).toHaveText(
      'Workflow contract ← geospatial',
    );
    // The popup lists REAL fixture state — a genuine key from this delegation's
    // workflow_state (geospatial resolution → 'osm_nominatim'; and the 'acquisition'
    // stage key). No field-picking: the whole contract is present.
    const body = page.getByTestId('workflow-contract-body');
    await expect(body).toContainText('osm_nominatim');
    await expect(body).toContainText('acquisition');

    // BYTE-FOR-BYTE: the popup body text is exactly the row's typed state
    // pretty-printed (JSON.stringify(state, null, 2)) — no summarizing, no reshape.
    const expected = JSON.stringify(firstCompletedWorkflowState(), null, 2);
    const actual = await body.evaluate((el) => el.textContent ?? '');
    expect(actual).toBe(expected);
    // And a specific leaf value survives byte-for-byte inside it.
    expect(actual).toContain('"provenance": "osm_nominatim"');

    // Screenshot the hover popup (regenerable, git-ignored).
    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-workflow-contract-hover.png'),
      fullPage: false,
    });

    // CLICK → the popup PINS: an X close button appears and the popup persists even
    // after the mouse leaves the icon (unpinned hover would close on mouse-leave).
    await firstIcon.click();
    const closeBtn = page.getByTestId('workflow-contract-close');
    await expect(closeBtn).toBeVisible();
    // Move the mouse well away — a PINNED popup stays open (a hover popup would not).
    await page.mouse.move(1200, 60);
    await expect(popup).toBeVisible();
    await expect(popup).toHaveAttribute('data-pinned', 'true');
    // Pinned content still matches the typed state byte-for-byte (text is selectable).
    expect(await body.evaluate((el) => el.textContent ?? '')).toBe(expected);

    await page.screenshot({
      path: resolve(REPO_SHOT, 'web-workflow-contract-pinned.png'),
      fullPage: false,
    });

    // The X button closes (unpins) the popup.
    await closeBtn.click();
    await expect(page.getByTestId('workflow-contract-popup')).toHaveCount(0);

    // Re-pin and prove Esc closes it too.
    await firstIcon.hover();
    await firstIcon.click();
    await expect(page.getByTestId('workflow-contract-popup')).toHaveAttribute('data-pinned', 'true');
    await page.mouse.move(1200, 60);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('workflow-contract-popup')).toHaveCount(0);
  });
});
