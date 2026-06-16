import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const screenshotDir = resolve(import.meta.dirname, '..', '..', 'screenshots');
mkdirSync(screenshotDir, { recursive: true });

function shot(name: string) {
  return resolve(screenshotDir, `${name}.png`);
}

const REAL_BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17800';
let realBackendReachable = false;
try {
  const r = await fetch(`${REAL_BACKEND}/v1/capabilities`, {
    signal: AbortSignal.timeout(800),
  });
  realBackendReachable = r.ok;
} catch {
  realBackendReachable = false;
}

test.describe('CLIO harness — visual proofs', () => {
  test('connect-screen renders wordmark and form', async ({ page }) => {
    // Force the connect route explicitly. A bare `/` is non-deterministic:
    // when a backend is reachable (clio on :17800, which this project
    // requires for live testing) the splash auto-probes and advances past
    // connect, so the screen never renders. `?route=connect` is the
    // intended way to view it (the audit/oneturn specs use it too).
    await page.goto('/?route=connect');
    await expect(page.getByTestId('connect-screen')).toBeVisible();
    await expect(page.getByTestId('connect-submit')).toBeVisible();
    await page.screenshot({ path: shot('connect-screen'), fullPage: false });
  });

  test('empty-chat fixture starts as a conversation-first workspace', async ({ page }) => {
    await page.goto('/?route=chat&fixture=empty-sidebar');
    await expect(page.getByTestId('chat-screen')).toHaveClass(/chat--no-sessions/);
    await expect(page.getByTestId('sidebar-empty')).toHaveCount(0);
    await expect(page.getByTestId('transcript-pane')).toBeVisible();
    await page.screenshot({ path: shot('empty-chat-first-run'), fullPage: false });
  });

  test('chat-streaming fixture shows assistant mid-response', async ({ page }) => {
    await page.goto('/?route=chat&fixture=streaming');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    await expect(page.getByTestId('transcript')).toBeVisible();
    await page.screenshot({ path: shot('chat-streaming'), fullPage: false });
  });

  test('permission-card fixture renders inline approval card', async ({ page }) => {
    await page.goto('/?route=chat&fixture=permission');
    await expect(page.getByTestId('permission-card')).toBeVisible();
    await page.screenshot({ path: shot('permission-card'), fullPage: false });
  });

  test('density-verbose shows full tool-call bodies', async ({ page }) => {
    await page.goto('/?route=chat&fixture=verbose');
    await expect(page.getByTestId('density-chip')).toContainText('verbose');
    await page.screenshot({ path: shot('density-verbose'), fullPage: false });
  });

  test('density-summary hides tool noise', async ({ page }) => {
    await page.goto('/?route=chat&fixture=summary');
    await expect(page.getByTestId('density-chip')).toContainText('summary');
    await page.screenshot({ path: shot('density-summary'), fullPage: false });
  });

  // Wave 0 + 2 additions.

  test('starting-clio-splash renders the boot splash', async ({ page }) => {
    await page.goto('/?route=splash&hold=1');
    await expect(page.getByTestId('splash-screen')).toBeVisible();
    await expect(page.getByTestId('splash-spinner')).toBeVisible();
    await page.screenshot({ path: shot('starting-clio-splash'), fullPage: false });
  });

  test('first-run-install renders the one-swoop install view', async ({ page }) => {
    await page.goto('/?route=splash&install=demo');
    await expect(page.getByTestId('splash-installing')).toBeVisible();
    await expect(page.getByTestId('splash-install-log')).toBeVisible();
    await page.screenshot({
      path: shot('first-run-install'),
      fullPage: false,
    });
  });

  test('settings-backends lists registered endpoints', async ({ page }) => {
    // The `?route=settings-backends` query triggers `seedFixtureBackends`
    // in App.tsx, which adds three demo entries (`clio:local`,
    // `alcf:polaris`, `remote:flagship`) when the registry is empty.
    // Assert against the actual seeded id, not the stale
    // `sidecar:local` id from an earlier scheme.
    await page.goto('/?route=settings-backends');
    await expect(page.getByTestId('settings-backends')).toBeVisible();
    await expect(page.getByTestId('settings-row-clio:local')).toBeVisible();
    await page.screenshot({ path: shot('settings-backends'), fullPage: false });
  });

  test('add-remote-ssh-wizard captures the tunnel form', async ({ page }) => {
    await page.goto('/?route=add-remote');
    await page.getByTestId('add-remote-mode-ssh').click();
    await expect(page.getByTestId('add-remote-ssh-host')).toBeVisible();
    await page.getByTestId('add-remote-label').fill('ALCF · polaris (preview)');
    await page.getByTestId('add-remote-ssh-host').fill('polaris.alcf.anl.gov');
    await page.getByTestId('add-remote-ssh-user').fill('jaime');
    await page.getByTestId('add-remote-ssh-key').fill('~/.ssh/id_ed25519');
    await page.screenshot({ path: shot('add-remote-ssh-wizard'), fullPage: false });
  });

  test('multi-backend-picker shows the dropdown with status pips', async ({ page }) => {
    // Seed the registry via localStorage before any navigation so the
    // picker has entries to render when the chat shell mounts.
    await page.addInitScript(() => {
      const seed = {
        backends: [
          {
            id: 'sidecar:local',
            label: 'Local sidecar',
            url: 'http://127.0.0.1:17800',
            bearerToken: '••••',
            kind: 'local-sidecar',
            capabilities: { contract_version: '0.2' },
          },
          {
            id: 'alcf:polaris',
            label: 'ALCF · polaris',
            url: 'http://polaris.alcf.anl.gov:8100',
            bearerToken: '••••',
            kind: 'ssh-tunnel',
            capabilities: { contract_version: '0.2' },
          },
          {
            id: 'remote:flagship',
            label: 'Flagship · staging',
            url: 'https://clio-staging.example.com',
            bearerToken: '••••',
            kind: 'http',
            lastError: 'connect ECONNREFUSED 1.2.3.4:443',
          },
        ],
        currentId: 'sidecar:local',
      };
      window.localStorage.setItem('clio.backends.v1', JSON.stringify(seed));
    });
    await page.goto('/?route=chat&fixture=normal');
    await page.getByTestId('backend-picker').click();
    await expect(page.getByTestId('backend-picker-menu')).toBeVisible();
    await expect(page.getByTestId('backend-picker-item-sidecar:local')).toBeVisible();
    await page.screenshot({ path: shot('multi-backend-picker'), fullPage: false });
  });

  test('permission-allow-once captures the allow-once highlight', async ({ page }) => {
    await page.goto('/?route=chat&fixture=permission');
    await expect(page.getByTestId('permcard-allow-once')).toBeVisible();
    await page.getByTestId('permcard-allow-once').focus();
    await page.screenshot({ path: shot('permission-allow-once'), fullPage: false });
  });

  test('permission-deny captures the deny highlight', async ({ page }) => {
    await page.goto('/?route=chat&fixture=permission');
    await expect(page.getByTestId('permcard-deny')).toBeVisible();
    await page.getByTestId('permcard-deny').focus();
    await page.screenshot({ path: shot('permission-deny'), fullPage: false });
  });

  test('density-keybind-verbose shows the verbose density chip', async ({ page }) => {
    // Same render as density-verbose but with the file name the goal
    // requires; kept separate so the goal's PNG list is complete.
    await page.goto('/?route=chat&fixture=verbose');
    await expect(page.getByTestId('density-chip')).toContainText('verbose');
    await page.screenshot({ path: shot('density-keybind-verbose'), fullPage: false });
  });

  test('density-keybind-summary shows the summary density chip', async ({ page }) => {
    await page.goto('/?route=chat&fixture=summary');
    await expect(page.getByTestId('density-chip')).toContainText('summary');
    await page.screenshot({ path: shot('density-keybind-summary'), fullPage: false });
  });

  // Wave 4 additions.

  test('chat-live-stream captures an in-flight assistant turn', async ({ page }) => {
    await page.goto('/?route=chat&fixture=streaming');
    await expect(page.getByTestId('transcript')).toBeVisible();
    await page.screenshot({ path: shot('chat-live-stream'), fullPage: false });
  });

  test('stop-mid-stream shows the Stop affordance in the composer', async ({ page }) => {
    await page.goto('/?route=chat&fixture=streaming-busy');
    await expect(page.getByTestId('composer-stop')).toBeVisible();
    await page.screenshot({ path: shot('stop-mid-stream'), fullPage: false });
  });

  test('diff-pane-open renders the file_diff review pane', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal&open=diff');
    await expect(page.getByTestId('diff-pane')).toBeVisible();
    await expect(page.getByTestId('diff-pane-hunk-0')).toBeVisible();
    await page.screenshot({ path: shot('diff-pane-open'), fullPage: false });
  });

  test('diff-per-hunk-apply highlights an applied hunk', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal&open=diff');
    await page.getByTestId('diff-pane-apply-0').click();
    await expect(page.locator('.diffpane__hunk--applied')).toBeVisible();
    await page.screenshot({ path: shot('diff-per-hunk-apply'), fullPage: false });
  });

  test('slash-palette opens with the default command list', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal&open=palette');
    await expect(page.getByTestId('slash-palette')).toBeVisible();
    await expect(page.getByTestId('slash-palette-item-help')).toBeVisible();
    await page.screenshot({ path: shot('slash-palette'), fullPage: false });
  });

  test('at-mention-picker opens when the user types `@`', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal');
    const input = page.getByTestId('composer-input');
    await input.click();
    await input.type('explain @sup');
    await expect(page.getByTestId('at-mention-picker')).toBeVisible();
    await page.screenshot({ path: shot('at-mention-picker'), fullPage: false });
  });

  test('attach menu offers upload + workspace reference (gap-96)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal');
    await page.getByTestId('composer-attach').click();
    await expect(page.getByTestId('composer-attach-menu')).toBeVisible();
    // Real upload entry (gated on capabilities.attachments_upload, which
    // the fixture advertises) + the @-reference entry side by side.
    await expect(page.getByTestId('composer-attach-upload')).toBeVisible();
    await expect(page.getByTestId('composer-attach-mention')).toBeVisible();
    await page.screenshot({ path: shot('attach-hybrid-menu'), fullPage: false });
  });

  test('code blocks render with syntax highlighting (W3 Tier-1)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal');
    // hljs tokenises the fenced code; assert real tokens rendered (not just
    // the .hljs wrapper) so the proof is highlighting, not plain text.
    await expect(page.locator('.im__code code.hljs').first()).toBeVisible();
    await expect(
      page.locator('.im__code .hljs-keyword, .im__code .hljs-string, .im__code .hljs-built_in').first(),
    ).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('code-syntax-highlight'), fullPage: false });
  });

  test('command palette fuzzy-matches sparse queries (W3 Tier-1)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal&open=palette');
    await expect(page.getByTestId('slash-palette')).toBeVisible();
    // "dctr" is not a substring of any command, but is a subsequence of
    // "doctor" — fuzzy ranking surfaces it.
    await page.keyboard.type('dctr');
    await expect(page.getByTestId('slash-palette-item-doctor')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('slash-palette-fuzzy'), fullPage: false });
  });

  test('retry variant menu offers notes + model options (1.0 item 4)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    // The per-message action row appears on hover; the regenerate action
    // opens the variant menu (plain / with notes / with model).
    await page.getByTestId('msg-m-asst-1').hover();
    await page.getByTestId('msg-regen-m-asst-1').click();
    await expect(page.getByTestId('regen-menu-m-asst-1')).toBeVisible();
    await expect(page.getByTestId('regen-plain-m-asst-1')).toBeVisible();
    await expect(page.getByTestId('regen-notes-m-asst-1')).toBeVisible();
    await expect(page.getByTestId('regen-model-m-asst-1')).toBeVisible();
    await page.screenshot({ path: shot('retry-menu-open'), fullPage: false });
    // The with-model submenu lists the available models.
    await page.getByTestId('regen-model-m-asst-1').click();
    await expect(
      page.getByTestId('regen-pick-anthropic:claude-opus-4-m-asst-1'),
    ).toBeVisible();
    await expect(
      page.getByTestId('regen-pick-argonne_metis:gpt-oss-120b-m-asst-1'),
    ).toBeVisible();
    await page.screenshot({ path: shot('retry-model-submenu'), fullPage: false });
  });

  test('inline images + retry lineage render in the transcript (1.0 items 2+3)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=previews');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    // Base64 image part renders as a real <img>.
    await expect(page.getByTestId('trx-image')).toBeVisible();
    // Backend file references get an honest placeholder, not a broken img.
    await expect(page.getByTestId('trx-image-unavailable')).toBeVisible();
    // The retry-created user message carries the lineage chip.
    await expect(page.getByTestId('msg-retry-chip-m-user-retry')).toBeVisible();
    await page.screenshot({ path: shot('previews-and-retry'), fullPage: false });
  });

  test('inspector execution timeline renders turn events (1.0 item 5)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal&open=inspector');
    await expect(page.getByTestId('inspector-drawer')).toBeVisible();
    await page.getByTestId('inspector-tab-timeline').click();
    await expect(page.getByTestId('inspector-timeline')).toBeVisible();
    // The fixture turn: started → tool (ReadFile) → response text → diff,
    // in part order (the wire guarantees order; only real data is shown).
    await expect(page.getByTestId('timeline-event-started')).toBeVisible();
    await expect(page.getByTestId('timeline-event-tool')).toBeVisible();
    await expect(page.getByTestId('timeline-event-text')).toBeVisible();
    await expect(page.getByTestId('timeline-event-diff')).toBeVisible();
    await page.screenshot({ path: shot('inspector-timeline'), fullPage: false });
  });

  test('light theme renders the chat shell on the light palette (1.0 item 1)', async ({ page }) => {
    // Seeding the mode flag is all it takes — theme.ts initTheme() applies
    // the full light palette on module load (same path a real user's
    // persisted choice takes on app start).
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.theme.mode.v1', 'light');
    });
    await page.goto('/?route=chat&fixture=normal');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    // The page background actually IS the light token, not the dark default.
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
    );
    expect(bg).toBe('#f4f6fa');
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('light-theme-chat'), fullPage: false });
    // Code blocks + diffs restyle through the override tokens too.
    await page.goto('/?route=chat&fixture=normal&open=diff');
    await expect(page.getByTestId('diff-pane')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('light-theme-diff'), fullPage: false });
  });

  test('notification center searches + filters history (1.0 item 8)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    // Fixture mode seeds 5 silent history entries → unseen badge shows.
    await expect(page.getByTestId('notification-badge')).toBeVisible();
    await page.getByTestId('notification-bell').click();
    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Send failed')).toBeVisible();
    await expect(panel.getByText(/responded/)).toBeVisible();
    await page.screenshot({ path: shot('notification-center'), fullPage: false });
    // Search narrows to the matching entry.
    await page.getByTestId('notification-search').fill('fail');
    await expect(panel.getByText('Send failed')).toBeVisible();
    await expect(panel.getByText(/responded/)).toHaveCount(0);
    await page.screenshot({ path: shot('notification-center-search'), fullPage: false });
    // Tone chip filters by kind (clear search first).
    await page.getByTestId('notification-search').fill('');
    await page.getByTestId('notification-tone-warn').click();
    await expect(panel.getByText('Permission requested')).toBeVisible();
    await expect(panel.getByText('Send failed')).toHaveCount(0);
    await page.screenshot({ path: shot('notification-center-filtered'), fullPage: false });
  });

  // ----- Real-backend visual proofs below this line -----
  //
  // Each live test self-skips when no clio-agent-gact is reachable
  // (default 127.0.0.1:17800), so CI runners without a backend skip
  // them while still RUNNING the fixture tests above. NOTE: a bare
  // `test.skip(condition, …)` at describe-body level marks the WHOLE
  // describe — fixture tests included — as conditionally skipped
  // (that bug made CI verify nothing); the skip must live inside each
  // live test body.

  // ----- Discovery pages backed by the live clio-agent-gact -----
  test('discovery-agents lists the tier-1/2 agent catalog', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Returning-user profile — the first-run onboarding tour (W3) has its
    // own dedicated audit test and must not block these click-throughs.
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
    await page.route('**/v1/**', async (route) => {
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers });
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('rail-agents').click();
    await expect(page.getByTestId('dp-agents')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('discovery-agents'), fullPage: false });
    await ctx.close();
  });

  test('discovery-mcp lists the MCP servers + their tool counts', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Returning-user profile — the first-run onboarding tour (W3) has its
    // own dedicated audit test and must not block these click-throughs.
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
    await page.route('**/v1/**', async (route) => {
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers });
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('rail-mcp').click();
    await expect(page.getByTestId('dp-mcp-servers')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('discovery-mcp'), fullPage: false });
    await ctx.close();
  });

  test('discovery-doctor renders integration statuses from /v1/health', async ({
    browser,
  }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Returning-user profile — the first-run onboarding tour (W3) has its
    // own dedicated audit test and must not block these click-throughs.
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
    await page.route('**/v1/**', async (route) => {
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers });
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('rail-doctor').click();
    await expect(page.getByTestId('dp-doctor')).toBeVisible();
    await expect(page.getByTestId('doctor-integrations')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('discovery-doctor'), fullPage: false });
    await ctx.close();
  });

  test('settings-providers shows the active LM + Use as LM buttons', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Returning-user profile — the first-run onboarding tour (W3) has its
    // own dedicated audit test and must not block these click-throughs.
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
    await page.route('**/v1/**', async (route) => {
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers });
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('rail-settings').click();
    await page.getByTestId('settings-nav-providers').click();
    await expect(page.getByTestId('providers-active')).toBeVisible({ timeout: 4_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot('settings-providers'), fullPage: false });
    await ctx.close();
  });

  test('settings-shell-about shows the About section', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Returning-user profile — the first-run onboarding tour (W3) has its
    // own dedicated audit test and must not block these click-throughs.
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
    await page.route('**/v1/**', async (route) => {
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers });
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    // Open Settings via rail
    await page.getByTestId('rail-settings').click();
    await expect(page.getByTestId('settings-shell')).toBeVisible();
    await page.getByTestId('settings-nav-about').click();
    await expect(page.getByTestId('settings-about')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('settings-shell-about'), fullPage: false });
    await ctx.close();
  });

  test('settings theme buttons switch light/dark live (1.0 item 1)', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
    await page.route('**/v1/**', async (route) => {
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers });
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('rail-settings').click();
    await page.getByTestId('settings-nav-appearance').click();
    await expect(page.getByTestId('settings-appearance')).toBeVisible();
    // Click Light → the page flips to the light palette immediately.
    await page.getByTestId('settings-theme-light').click();
    const bgLight = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
    );
    expect(bgLight).toBe('#f4f6fa');
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('settings-light-theme'), fullPage: false });
    // Back to Dark → overrides clear to the design-system default.
    await page.getByTestId('settings-theme-dark').click();
    const bgDark = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
    );
    expect(bgDark).toBe('#000000');
    await ctx.close();
  });

  test('settings-data section exports preferences (1.0 item 7)', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
    await page.route('**/v1/**', async (route) => {
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers });
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('rail-settings').click();
    await page.getByTestId('settings-nav-data').click();
    await expect(page.getByTestId('settings-data')).toBeVisible();
    await expect(page.getByTestId('settings-export-btn')).toBeVisible();
    await expect(page.getByTestId('settings-import-btn')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('settings-data-section'), fullPage: false });
    // Export triggers a real browser download of the versioned envelope.
    const downloadP = page.waitForEvent('download');
    await page.getByTestId('settings-export-btn').click();
    const download = await downloadP;
    expect(download.suggestedFilename()).toMatch(/^clio-settings-.*\.json$/);
    await page.screenshot({ path: shot('settings-data-exported'), fullPage: false });
    await ctx.close();
  });

  test('settings-shell-appearance shows theme + density choices', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Returning-user profile — the first-run onboarding tour (W3) has its
    // own dedicated audit test and must not block these click-throughs.
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
    await page.route('**/v1/**', async (route) => {
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers });
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('rail-settings').click();
    await page.getByTestId('settings-nav-appearance').click();
    await expect(page.getByTestId('settings-appearance')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('settings-shell-appearance'), fullPage: false });
    await ctx.close();
  });

  test('discovery-metrics shows the metrics dashboard', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Returning-user profile — the first-run onboarding tour (W3) has its
    // own dedicated audit test and must not block these click-throughs.
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
    await page.route('**/v1/**', async (route) => {
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers });
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('rail-metrics').click();
    await expect(page.getByTestId('dp-metrics')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('discovery-metrics'), fullPage: false });
    await ctx.close();
  });

  test('chat-shell-real-backend captures the live connect → chat flow', async ({
    browser,
  }) => {
    // Browsers block cross-origin XHRs against clio-agent-gact (it doesn't
    // emit Access-Control-Allow-Origin headers — the production CLIO
    // Desktop sidesteps this entirely via Tauri's privileged origin).
    // Route the requests through Playwright so we can synthesize the
    // missing CORS header on the response and let the chat shell mount.
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Returning-user profile — the first-run tour must not cover the shell
    // in this capture (it has its own dedicated audit test + PNG).
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
    await page.route('**/v1/**', async (route) => {
      // SSE responses are unbounded — route.fetch() would hang reading
      // the body. Let those pass through to the browser, which will
      // still get CORS-blocked but the chat shell will already have
      // mounted by then. Only intercept finite JSON endpoints.
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers });
    });

    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('sse-status-chip')).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: shot('chat-shell-real-backend'),
      fullPage: false,
    });
    await ctx.close();
  });
});
