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
    await page.goto('/');
    await expect(page.getByTestId('connect-screen')).toBeVisible();
    await expect(page.getByTestId('connect-submit')).toBeVisible();
    await page.screenshot({ path: shot('connect-screen'), fullPage: false });
  });

  test('empty-sidebar fixture shows zero-session affordance', async ({ page }) => {
    await page.goto('/?route=chat&fixture=empty-sidebar');
    await expect(page.getByTestId('sidebar-empty')).toBeVisible();
    await page.screenshot({ path: shot('empty-sidebar'), fullPage: false });
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

  // Real-backend visual proof — only captured when a clio-agent-gact
  // server is reachable (default 127.0.0.1:17800). Otherwise skipped so
  // CI runners without the install don't fail. On the developer's box
  // this captures the live chat shell hitting the user's actual ALCF-
  // configured backend, not a fixture.
  test.skip(
    !realBackendReachable,
    `no clio-agent-gact on ${REAL_BACKEND} — skipping real-backend visual proof`,
  );

  // ----- Discovery pages backed by the live clio-agent-gact -----
  test('discovery-agents lists the tier-1/2 agent catalog', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
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
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
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
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
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
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
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
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
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

  test('settings-shell-appearance shows theme + density choices', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
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
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
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
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
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
