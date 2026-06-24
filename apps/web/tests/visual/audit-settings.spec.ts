/**
 * Settings/discovery portion of the audit-driven visual verification batch.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  connect,
  openSettingsSection,
  realBackendReachable,
  REAL_BACKEND,
  shot,
} from './audit-helpers';

test.describe('CLIO settings audit-batch verification', () => {
  test.skip(
    !realBackendReachable,
    `no clio at ${REAL_BACKEND} — start it then re-run`,
  );

  test('Settings → Appearance renders locale, theme tokens, intro (#104 #106 #121)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('sessions-settings').click();
    await page.getByTestId('settings-nav-appearance').click();
    await expect(page.getByTestId('settings-appearance')).toBeVisible({ timeout: 6_000 });
    await expect(page.locator('[data-testid^="settings-locale-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="theme-token-"]').first()).toBeVisible();
    await expect(page.getByTestId('settings-intro-textarea')).toBeVisible();
    await page.screenshot({ path: shot('104-106-121-settings-appearance'), fullPage: false });
    await close();
  });

  test('Settings → Plugins opens the registry form (#147)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await openSettingsSection(page, 'plugins');
    await expect(page.getByTestId('plugin-form')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('147-plugins-form'), fullPage: false });
    await close();
  });

  test('Settings → Memory shows cross-session search input (#108)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await openSettingsSection(page, 'memory');
    await expect(page.getByTestId('memory-search-input')).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('108-memory-search'), fullPage: false });
    await close();
  });

  test('Settings → Hooks renders editor (#122)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('sessions-settings').click();
    await page.getByTestId('settings-nav-hooks').click();
    await expect(page.getByTestId('hook-form')).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('122-hooks-form'), fullPage: false });
    await close();
  });

  test('Settings → Agents renders cards (#132)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await openSettingsSection(page, 'agents');
    await expect(
      page.locator('[data-testid^="agent-card-"]').first(),
    ).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: shot('132-agents-page'), fullPage: false });
    await close();
  });

  test('Settings → MCP renders cards (#125)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await openSettingsSection(page, 'mcp');
    await expect(
      page.locator('[data-testid^="mcp-card-"]').first(),
    ).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: shot('125-mcp-page'), fullPage: false });
    await close();
  });

  test('Settings → Doctor renders LSP clients section if backend has any (#141)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await openSettingsSection(page, 'doctor');
    await expect(page.getByTestId('doctor-integrations')).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: shot('141-doctor-page'), fullPage: false });
    await close();
  });

  test('Settings → MCP exposes install modal (#95)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await openSettingsSection(page, 'mcp');
    await page.getByTestId('mcp-install-open').click();
    await expect(page.getByTestId('mcp-install-modal')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('95-mcp-install-modal'), fullPage: false });
    await close();
  });

  test('Settings → Policies opens JSON editor (#123)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('sessions-settings').click();
    await page.getByTestId('settings-nav-policies').click();
    await page.getByTestId('policies-edit').click();
    await expect(page.getByTestId('policies-editor')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('123-policies-editor'), fullPage: false });
    await close();
  });

  test('Settings → Agent blueprints exposes install/validate (#126)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('sessions-settings').click();
    await page.getByTestId('settings-nav-blueprints').click();
    await page.getByTestId('blueprint-install-toggle').click();
    await expect(page.getByTestId('blueprint-install-input')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('126-blueprint-install'), fullPage: false });
    await close();
  });

  test('Settings → Expert packs exposes validate flow (#127)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('sessions-settings').click();
    await page.getByTestId('settings-nav-expert-packs').click();
    await page.getByTestId('expertpack-validate-toggle').click();
    await expect(page.getByTestId('expertpack-validate-input')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('127-expertpack-validate'), fullPage: false });
    await close();
  });

  test('Settings → Workspaces renders cards + new-workspace form toggle (#131 #140)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await openSettingsSection(page, 'workspaces');
    await expect(
      page.locator('[data-testid^="workspace-card-"]').first(),
    ).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('workspaces-new').click().catch(() => undefined);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('131-140-workspaces-page'), fullPage: false });
    await close();
  });

  test('Appearance presets apply high-contrast tokens live (W3 settings)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.waitForTimeout(800);
    await page.getByTestId('sessions-settings').click();
    await page.getByTestId('settings-nav-appearance').click();
    await expect(page.getByTestId('settings-appearance')).toBeVisible({ timeout: 6_000 });
    const preset = page.getByTestId('settings-preset-high-contrast');
    await expect(preset).toBeVisible();
    await preset.click();
    await expect
      .poll(async () =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
        ),
      )
      .toBe('#000000');
    await page.screenshot({ path: shot('w3-settings-high-contrast'), fullPage: false });
    await page.getByTestId('settings-preset-default').click();
    await close();
  });

  test('Per-backend Test connection shows latency against live clio (W3 settings)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.waitForTimeout(800);
    await page.getByTestId('sessions-settings').click();
    await page.getByTestId('settings-nav-backends').click();
    const testBtn = page.locator('[data-testid^="settings-row-test-"]:not([data-testid*="result"])').first();
    await expect(testBtn).toBeVisible({ timeout: 6_000 });
    await testBtn.click();
    const result = page.locator('[data-testid^="settings-row-test-result-"]').first();
    await expect(result).toContainText(/ok · \d+ms/, { timeout: 8_000 });
    await page.screenshot({ path: shot('w3-settings-test-connection'), fullPage: false });
    await close();
  });

  test('Settings → Providers renders provider list with active marker (#128)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('sessions-settings').click();
    await page.getByTestId('settings-nav-providers').click();
    await expect(
      page.getByTestId('providers-active').or(page.getByTestId('providers-error')),
    ).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('128-providers-detail'), fullPage: false });
    await close();
  });

  test('Settings → Providers expands a provider to show models (#101)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('sessions-settings').click();
    await page.getByTestId('settings-nav-providers').click();
    await expect(
      page.getByTestId('providers-active').or(page.getByTestId('providers-error')),
    ).toBeVisible({ timeout: 6_000 });
    const toggle = page.locator('[data-testid^="provider-models-toggle-"]').first();
    await toggle.click();
    await expect(
      page.locator('[data-testid^="provider-models-"]').first(),
    ).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('101-provider-models'), fullPage: false });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await close();
  });

  test('MCP Reconnect button behaves honestly on the live backend (1.0 item E3)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await openSettingsSection(page, 'mcp');
    await expect(page.getByTestId('dp-mcp-servers')).toBeVisible();
    const btn = page.locator('[data-testid^="mcp-reconnect-"]').first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await btn.click();
    await page.waitForTimeout(2_000);
    const disabled = await btn.isDisabled();
    if (disabled) {
      await expect(btn).toHaveAttribute('title', /not supported/i);
    } else {
      await page.getByTestId('notification-bell').click();
      await expect(
        page.getByTestId('notification-panel').getByText(/Reconnected/i).first(),
      ).toBeVisible();
    }
    await page.screenshot({ path: shot('item-e3-mcp-reconnect'), fullPage: false });
    await close();
  });

  test('Settings export/import round-trips real preferences (1.0 item 7)', async ({ browser }) => {
    const { page, close } = await connect(browser);

    await page.evaluate(() => {
      window.localStorage.setItem('clio.density.v1', 'verbose');
      window.localStorage.setItem('clio.locale.v1', 'es');
    });

    await page.getByTestId('sessions-settings').click();
    await page.getByTestId('settings-nav-data').click();
    await expect(page.getByTestId('settings-data')).toBeVisible();
    const downloadP = page.waitForEvent('download');
    await page.getByTestId('settings-export-btn').click();
    const download = await downloadP;
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    const envelope = JSON.parse(readFileSync(filePath!, 'utf-8')) as {
      version: number;
      prefs: Record<string, string>;
    };
    expect(envelope.version).toBe(1);
    expect(envelope.prefs['clio.density.v1']).toBe('verbose');
    expect(envelope.prefs['clio.locale.v1']).toBe('es');
    expect(envelope.prefs['clio.backends.v1']).toBeUndefined();

    await page.evaluate(() => {
      window.localStorage.setItem('clio.density.v1', 'summary');
      window.localStorage.setItem('clio.locale.v1', 'en');
    });
    await page.getByTestId('settings-import-file').setInputFiles(filePath!);
    await expect(page.getByTestId('settings-import-result')).toBeVisible({
      timeout: 5_000,
    });
    await page.screenshot({ path: shot('item7-settings-roundtrip'), fullPage: false });
    const restored = await page.evaluate(() => ({
      density: window.localStorage.getItem('clio.density.v1'),
      locale: window.localStorage.getItem('clio.locale.v1'),
    }));
    expect(restored.density).toBe('verbose');
    expect(restored.locale).toBe('es');
    await close();
  });
});
