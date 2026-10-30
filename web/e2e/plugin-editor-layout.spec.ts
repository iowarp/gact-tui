import { expect, test } from '@playwright/test';
import { setupWorkspaceBrowser } from './workspace-setup';

setupWorkspaceBrowser();
const text = `---\nname: update-models\ndescription: Refresh model catalogs\n---\n# Update Models\n${'Read and verify provider state before refreshing models.\n'.repeat(600)}END OF LONG SKILL`;
const plugin = {
  id: 'fleet',
  ref: 'clio-builtin/fleet',
  marketplace: 'clio-builtin',
  trusted: true,
  skills: ['update-models'],
};

for (const viewport of [
  { width: 390, height: 700 },
  { width: 1280, height: 800 },
]) {
  test(`local skill editor keeps controls visible and saves a separate copy at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() =>
      localStorage.setItem(
        'clio.appearance.v1',
        JSON.stringify({ theme: 'light', motion: 'reduced' }),
      ),
    );
    await page.route('**/v1/capabilities', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({
        json: {
          ...data,
          capabilities: {
            ...data.capabilities,
            x_clio_agent_plugins: true,
            x_clio_extension_library: true,
          },
        },
      });
    });
    await page.route('**/v1/plugins', (route) => route.fulfill({ json: { plugins: [plugin] } }));
    await page.route('**/v1/plugins/marketplaces', (route) =>
      route.fulfill({ json: { marketplaces: [] } }),
    );
    await page.route('**/v1/tools', (route) => route.fulfill({ json: { tools: [] } }));
    await page.route('**/v1/mcp/configuration', (route) =>
      route.fulfill({ json: { servers: [] } }),
    );
    let saved: { name: string; files: Record<string, string> } | undefined;
    await page.route('**/v1/plugins/inspect?*', (route) => {
      const ref = new URL(route.request().url()).searchParams.get('ref')!;
      return route.fulfill({
        json: {
          plugin: ref.startsWith('private-local/')
            ? { ...plugin, ref, id: 'update-models-local', marketplace: 'private-local' }
            : plugin,
          files: [
            {
              path: 'SKILL.md',
              text: saved?.files['SKILL.md'] ?? text,
              bytes: text.length,
              truncated: false,
              error: '',
              sha256: 'synthetic',
            },
          ],
          incomplete: false,
          reason: '',
        },
      });
    });
    await page.route('**/v1/plugins/local', async (route) => {
      expect(route.request().method()).toBe('POST');
      saved = route.request().postDataJSON();
      await route.fulfill({
        json: {
          marketplace: 'private-local',
          plugins: ['update-models-local'],
          agents: [],
          trusted: true,
          pending_trust: [],
          diagnostics: [],
        },
      });
    });
    await page.goto('/settings/plugins');
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    await page
      .getByRole('button', { name: 'update-models clio-builtin / fleet', exact: true })
      .click();
    await page.getByRole('button', { name: 'Open skill', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'update-models', exact: true });
    await dialog.getByRole('button', { name: 'Edit a local copy' }).click();
    const editor = dialog.getByRole('textbox', { name: 'Edit SKILL.md' });
    const save = dialog.getByRole('button', { name: 'Save local copy' });
    await expect(editor).toBeVisible();
    await expect(save).toBeInViewport();
    const metrics = await editor.evaluate((node: HTMLTextAreaElement) => ({
      height: node.clientHeight,
      content: node.scrollHeight,
      sizing: getComputedStyle(node).getPropertyValue('field-sizing'),
    }));
    expect(metrics.height).toBeGreaterThan(40);
    expect(metrics.content).toBeGreaterThan(metrics.height * 3);
    expect(metrics.sizing).toBe('fixed');
    await editor.click();
    await editor.press('Control+End');
    await editor.press('Enter');
    await editor.pressSequentially('Local edited instruction');
    expect(await editor.evaluate((node: HTMLTextAreaElement) => node.scrollTop)).toBeGreaterThan(0);
    await expect(save).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`editor-${viewport.width}.png`) });

    await dialog.getByRole('button', { name: 'File actions' }).click();
    await page.getByRole('menuitem', { name: 'View file fullscreen' }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await expect(save).toBeInViewport();
    await expect(editor).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`editor-fullscreen-${viewport.width}.png`) });
    await page.evaluate(() => document.exitFullscreen());
    await save.click();
    await expect(
      dialog.getByText('private-local/update-models-local', { exact: true }),
    ).toBeVisible();
    expect(saved?.name).toBe('update-models-local');
    expect(saved?.files['SKILL.md']).toBe(`${text}\nLocal edited instruction`);
    await dialog.getByText('Use this copy in an agent').click();
    await expect(dialog.getByText(/Duplicate skill names are rejected/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`saved-copy-${viewport.width}.png`) });
  });
}
