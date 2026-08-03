/**
 * Opt-in extended real-system MCP UI validation.
 *
 * Run with the same environment as `overnight-real-multibackend.spec.ts`:
 *
 *   CLIO_OVERNIGHT_EXTENDED_UI=1 \
 *   CLIO_BACKEND_A_URL=http://127.0.0.1:18131 \
 *   CLIO_BACKEND_B_URL=http://127.0.0.1:18132 \
 *   pnpm test:visual --grep "overnight extended real UI .*MCP"
 */

import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BACKEND_A,
  ENABLED,
  WORKSPACE_A_ROOT,
  allowBackendCors,
  api,
  auditDir,
  createSession,
  firstWorkspace,
  openBrowser,
  reachableA,
  seedRegistry,
  shot,
  workspaceByRoot,
} from './overnight-real-helpers';

test.setTimeout(8 * 60 * 1000);

test('overnight extended real UI expands live MCP server details', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight mcp detail ${stamp}`);
  const serverList = await api<{ servers: Array<{ id: string; name: string; status?: string; tools_count?: number }> }>(
    BACKEND_A,
    '/v1/mcp/servers',
  );
  const target =
    serverList.servers.find((server) => server.status === 'ready' && (server.tools_count ?? 0) > 0) ??
    serverList.servers.find((server) => (server.tools_count ?? 0) > 0) ??
    serverList.servers[0];

  if (!target) {
    test.skip(true, `${BACKEND_A} returned no MCP servers`);
    return;
  }

  const { browser, ctx, page } = await openBrowser();
  let detailSections: string[] = [];
  try {
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('settings-nav-mcp').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-mcp-servers')).toBeVisible({ timeout: 10_000 });

    const card = page.getByTestId(`mcp-card-${target.id}`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByTestId(`mcp-expand-${target.id}`).click({ timeout: 5_000 });
    await expect(card.locator('.mcp__detail')).toBeVisible({ timeout: 10_000 });
    await expect(card.locator('.mcp__detail-status').filter({ hasText: 'Loading' })).toHaveCount(0, {
      timeout: 10_000,
    });
    detailSections = await card.locator('.mcp__detail-title').evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? '').filter(Boolean),
    );
    await page.screenshot({ path: shot('overnight-real-mcp-detail'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }

  expect(detailSections.length).toBeGreaterThan(0);
  writeFileSync(
    resolve(auditDir, 'overnight-real-mcp-detail.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        target,
        detailSections,
        servers: serverList.servers,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI installs, reconnects, and uninstalls an MCP server', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const serverName = `everything_live_${stamp}`;
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight mcp lifecycle ${stamp}`);
  const beforeServers = await api<{ servers: unknown[] }>(BACKEND_A, '/v1/mcp/servers');

  const { browser, ctx, page } = await openBrowser();
  let installedId = '';
  let installStatus = 0;
  let reconnectStatus = 0;
  let deleteStatus = 0;
  let afterInstallServers: unknown = null;
  let afterDeleteServers: unknown = null;
  try {
    page.on('dialog', (dialog) => void dialog.accept());
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('settings-nav-mcp').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-mcp-servers')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('mcp-install-open').click({ timeout: 5_000 });
    await expect(page.getByTestId('mcp-install-modal')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('mcp-install-name').fill(serverName);
    await page.getByTestId('mcp-install-command').fill('npx');
    await page
      .getByTestId('mcp-install-args')
      .fill('-y\n@modelcontextprotocol/server-everything');
    await page.screenshot({ path: shot('overnight-real-mcp-install-form'), fullPage: false });

    const [installResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/v1/mcp/servers') && r.request().method() === 'POST',
        { timeout: 45_000 },
      ),
      page.getByTestId('mcp-install-submit').click({ timeout: 5_000 }),
    ]);
    installStatus = installResponse.status();
    expect(installResponse.ok()).toBe(true);
    const installBody = (await installResponse.json()) as { id?: string };
    installedId = installBody.id ?? '';
    expect(installedId).toMatch(/^mcp_/);

    const installedCard = page.getByTestId(`mcp-card-${installedId}`);
    await expect(installedCard).toBeVisible({ timeout: 20_000 });
    await expect(installedCard).toContainText(serverName);
    await expect(installedCard).toContainText('ready');
    await expect(installedCard).toContainText('13 tools');
    afterInstallServers = await api(BACKEND_A, '/v1/mcp/servers');
    await installedCard.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot('overnight-real-mcp-installed'), fullPage: false });

    await installedCard.getByTestId(`mcp-expand-${installedId}`).click({ timeout: 5_000 });
    await expect(installedCard.locator('.mcp__detail')).toBeVisible({ timeout: 10_000 });
    await expect(
      installedCard.locator('.mcp__detail .mcp__detail-name').filter({ hasText: 'echo' }),
    ).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot('overnight-real-mcp-expanded'), fullPage: false });

    const [reconnectResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/v1/mcp/servers/${installedId}/reconnect`) &&
          r.request().method() === 'POST',
        { timeout: 45_000 },
      ),
      installedCard.getByTestId(`mcp-reconnect-${installedId}`).click({ timeout: 5_000 }),
    ]);
    reconnectStatus = reconnectResponse.status();
    expect(reconnectResponse.ok()).toBe(true);
    await expect(installedCard).toContainText('ready', { timeout: 20_000 });
    await page.screenshot({ path: shot('overnight-real-mcp-reconnected'), fullPage: false });

    const [deleteResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/v1/mcp/servers/${installedId}`) &&
          r.request().method() === 'DELETE',
        { timeout: 20_000 },
      ),
      installedCard.getByTestId(`mcp-uninstall-${installedId}`).click({ timeout: 5_000 }),
    ]);
    deleteStatus = deleteResponse.status();
    expect(deleteStatus).toBeLessThan(400);
    await expect(page.getByTestId(`mcp-card-${installedId}`)).toHaveCount(0, {
      timeout: 20_000,
    });
    afterDeleteServers = await api(BACKEND_A, '/v1/mcp/servers');
    await page.screenshot({ path: shot('overnight-real-mcp-deleted'), fullPage: false });
    installedId = '';
  } finally {
    await ctx.close();
    await browser.close();
    if (installedId) {
      await fetch(`${BACKEND_A}/v1/mcp/servers/${encodeURIComponent(installedId)}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
  }

  writeFileSync(
    resolve(auditDir, 'overnight-real-mcp-lifecycle.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        serverName,
        installStatus,
        reconnectStatus,
        deleteStatus,
        beforeServers,
        afterInstallServers,
        afterDeleteServers,
      },
      null,
      2,
    ),
  );
});
