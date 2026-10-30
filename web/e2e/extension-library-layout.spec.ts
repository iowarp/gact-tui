import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { setupWorkspaceBrowser } from './workspace-setup';

setupWorkspaceBrowser();

const plugins = [
  'core',
  'fleet',
  'memory',
  'orchestration',
  'abaqus',
  'adios',
  'geo',
  'ndp',
  'web',
].map((id) => ({
  id,
  ref: `clio/${id}`,
  marketplace: 'clio',
  version: '1.0.0',
  trusted: true,
  description: `The ${id} plugin provides scientific tools and guidance for this workspace.`,
  tools: [`${id}_search`],
  skills: [`${id}-guide`],
}));
const definition = {
  id: 'dememory-clio',
  name: 'Dememory Clio',
  description: 'A research partner with memory removed.',
  extends: 'clio/factorio',
  add: [],
  remove: ['memory'],
};

for (const width of [390, 1280]) {
  test(`compact library disclosures and private agent sources at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
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
    await page.route('**/v1/plugins', (route) => route.fulfill({ json: { plugins } }));
    await page.route('**/v1/plugins/marketplaces', (route) =>
      route.fulfill({
        json: {
          marketplaces: [
            {
              name: 'clio',
              source: 'https://github.com/iowarp/clio-agent-marketplace.git',
              trusted: true,
              default: true,
              format: 'agent-plugins',
            },
          ],
        },
      }),
    );
    await page.route('**/v1/agents', (route) =>
      route.fulfill({
        json: {
          agents: [
            {
              ref: 'clio/factorio',
              id: 'factorio',
              name: 'Factorio',
              marketplace: 'clio',
              description: 'Materials science and manufacturing.',
              plugins: [{ ref: 'clio/abaqus' }],
            },
            {
              ref: 'user/dememory-clio',
              ...definition,
              kind: 'user',
              delta: { add: [], remove: ['memory'] },
            },
          ],
        },
      }),
    );
    await page.route('**/v1/plugins/local', (route) =>
      route.fulfill({
        json: {
          root: 'D:/CLIO/config/plugins',
          agents_directory: 'D:/CLIO/config/plugins/user-agents',
          plugins_directory: 'D:/CLIO/config/plugins/local/private-local/plugins',
          agents: [
            {
              ref: 'user/dememory-clio',
              path: 'D:/CLIO/config/plugins/user-agents/dememory-clio.json',
              definition,
            },
          ],
        },
      }),
    );
    // Browser byte-transfer proof; real agent export/import is tested by the API.
    const zip = Buffer.alloc(22);
    zip.writeUInt32LE(0x06054b50);
    await page.route('**/v1/plugins/local/export', (route) =>
      route.fulfill({ contentType: 'application/zip', body: zip }),
    );
    await page.route('**/v1/mcp/servers?*', (route) =>
      route.fulfill({
        json: {
          servers: [
            {
              id: 'mcp_ndp',
              name: 'ndp',
              source: 'plugin',
              plugin: 'ndp',
              transport: 'stdio',
              status: 'ready',
              tools: ['ndp_search'],
              tools_count: 1,
              spec: {},
            },
          ],
        },
      }),
    );
    await page.route('**/v1/tools*', (route) => route.fulfill({ json: { tools: [] } }));
    await page.route('**/v1/mcp/configuration', (route) =>
      route.fulfill({ json: { servers: [] } }),
    );

    await page.goto('/settings/plugins');
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    const skill = page.getByRole('button', { name: 'core-guide clio / core', exact: true });
    await expect(skill).toBeVisible();
    expect((await skill.boundingBox())!.height).toBeLessThanOrEqual(40);
    await expect(page.getByRole('button', { name: 'Open skill', exact: true })).toHaveCount(0);
    await skill.click();
    await expect(page.getByRole('button', { name: 'Open skill', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`skills-${width}.png`) });

    await page.getByRole('button', { name: 'Plugins', exact: true }).click();
    const plugin = page.getByRole('button', { name: 'core 1.0.0', exact: true });
    await expect(plugin).toHaveAttribute('aria-expanded', 'false');
    expect((await plugin.boundingBox())!.height).toBeLessThanOrEqual(40);
    await plugin.click();
    await expect(page.getByRole('button', { name: 'Explore core', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`plugins-${width}.png`) });

    await page.getByRole('button', { name: 'Marketplaces', exact: true }).click();
    const marketplacePanel = page
      .getByRole('region', { name: 'Marketplaces', exact: true, includeHidden: true })
      .locator('..');
    const captureMenu = async (name: string) => {
      const panelBox = (await marketplacePanel.boundingBox())!;
      const menuBox = (await page.getByRole('menu').boundingBox())!;
      await page.screenshot({
        path: testInfo.outputPath(`${name}-${width}.png`),
        clip: {
          x: panelBox.x,
          y: panelBox.y,
          width: panelBox.width,
          height: Math.max(panelBox.height, menuBox.y + menuBox.height - panelBox.y) + 8,
        },
      });
    };
    await page.getByRole('button', { name: 'Actions for clio' }).click();
    await expect(page.getByRole('menuitem', { name: 'Open repository' })).toHaveAttribute(
      'href',
      'https://github.com/iowarp/clio-agent-marketplace',
    );
    await expect(page.getByRole('menuitem', { name: 'Copy source' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Update', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Check plugins' })).toBeVisible();
    await captureMenu('remote-marketplace-menu');
    await page.keyboard.press('Escape');
    const localActions = page.getByRole('button', { name: 'Actions for private-local' });
    await localActions.click();
    await expect(page.getByRole('menuitem', { name: 'Back up with GitHub…' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Download marketplace ZIP' })).toBeEnabled();
    await expect(page.getByRole('menuitem', { name: 'Add remote marketplace…' })).toBeVisible();
    await captureMenu('local-marketplace-menu');
    await page.getByRole('menuitem', { name: 'Add remote marketplace…' }).click();
    const remoteInstall = page.getByRole('dialog', { name: 'Install a marketplace' });
    await expect(remoteInstall.getByRole('textbox', { name: 'Source' })).toBeVisible();
    await remoteInstall.getByRole('button', { name: 'Cancel', exact: true }).click();
    await localActions.click();
    await page.getByRole('menuitem', { name: 'Marketplace details' }).click();
    const closedRowDetails = page.getByRole('dialog', { name: 'Local marketplace details' });
    await expect(
      closedRowDetails.getByText('D:/CLIO/config/plugins/user-agents', { exact: true }),
    ).toBeVisible();
    await closedRowDetails.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: /Private local marketplace/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.getByText('D:/CLIO/config/plugins/user-agents', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText('Dememory Clio', { exact: true })).toBeVisible();
    await expect(page.getByText('No local skills or plugins yet.')).toHaveCount(0);
    await expect(page.getByText(/"remove":/)).toHaveCount(0);
    await expect(localActions).toBeVisible();
    await marketplacePanel.screenshot({
      path: testInfo.outputPath(`local-marketplace-${width}.png`),
    });
    await page.getByRole('button', { name: 'Dememory Clio Agent', exact: true }).click();
    await expect(page.getByText(/Starts from Factorio; removes memory/)).toBeVisible();
    await marketplacePanel.screenshot({
      path: testInfo.outputPath(`local-agent-details-${width}.png`),
    });
    await page.getByRole('button', { name: 'View saved file' }).click();
    const savedFile = page.getByRole('dialog', { name: 'Dememory Clio: saved file' });
    await expect(
      savedFile.getByText('D:/CLIO/config/plugins/user-agents/dememory-clio.json'),
    ).toBeVisible();
    await expect(savedFile.locator('[data-slot="file-viewer"]')).toContainText('"memory"');
    const fileGeometry = await savedFile.evaluate((dialog) => {
      const bounds = dialog.getBoundingClientRect();
      const title = dialog.querySelector('[data-slot="dialog-title"]')!.getBoundingClientRect();
      const close = dialog.querySelector('[data-slot="dialog-close"]')!.getBoundingClientRect();
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        titleTop: title.top,
        closeTop: close.top,
        scrollTop: dialog.scrollTop,
        height: bounds.height,
        scrollHeight: dialog.scrollHeight,
      };
    });
    await testInfo.attach(`saved-file-geometry-${width}.json`, {
      body: JSON.stringify(fileGeometry),
      contentType: 'application/json',
    });
    expect(fileGeometry.titleTop).toBeGreaterThanOrEqual(fileGeometry.top);
    expect(fileGeometry.closeTop).toBeGreaterThanOrEqual(fileGeometry.top);
    expect(fileGeometry.scrollTop).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`local-agent-source-${width}.png`) });
    await savedFile.getByRole('button', { name: 'Close', exact: true }).click();
    await localActions.click();
    await page.getByRole('menuitem', { name: 'Marketplace details' }).click();
    const marketplaceDetails = page.getByRole('dialog', { name: 'Local marketplace details' });
    await expect(
      marketplaceDetails.getByText('D:/CLIO/config/plugins/user-agents', { exact: true }),
    ).toBeVisible();
    await expect(marketplaceDetails.getByText('Dememory Clio')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`local-storage-${width}.png`) });
    await marketplaceDetails.getByRole('button', { name: 'Close', exact: true }).click();
    await localActions.click();
    await page.getByRole('menuitem', { name: 'Back up with GitHub…' }).click();
    const backup = page.getByRole('dialog', { name: 'Back up to GitHub' });
    await expect(backup.getByRole('button', { name: 'Download marketplace ZIP' })).toBeEnabled();
    await expect(backup.getByRole('link', { name: 'Create GitHub repository' })).toHaveAttribute(
      'href',
      'https://github.com/new',
    );
    await page.screenshot({ path: testInfo.outputPath(`local-github-backup-${width}.png`) });
    const download = page.waitForEvent('download');
    await backup.getByRole('button', { name: 'Download marketplace ZIP' }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe('private-local-marketplace.zip');
    expect(await readFile((await saved.path())!)).toEqual(zip);
    await backup.getByRole('button', { name: 'Close', exact: true }).click();
    await localActions.click();
    const directDownload = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Download marketplace ZIP' }).click();
    expect(await readFile((await (await directDownload).path())!)).toEqual(zip);

    await page.getByRole('button', { name: 'MCP connections', exact: true }).click();
    const mcp = page.getByRole('button', { name: 'Show the tools of ndp' });
    await expect(mcp).toBeVisible();
    expect((await mcp.boundingBox())!.height).toBeLessThanOrEqual(40);
    await mcp.click();
    await expect(page.getByRole('list', { name: 'Tools of ndp' })).toContainText('ndp_search');
    await page.screenshot({ path: testInfo.outputPath(`mcp-${width}.png`) });

    await page.goto('/settings/agents');
    const agent = page.getByRole('button', { name: 'Dememory Clio Yours', exact: true });
    await expect(agent).toBeVisible();
    expect((await agent.boundingBox())!.height).toBeLessThanOrEqual(40);
    await agent.click();
    await expect(page.getByText(/Starts from Factorio; removes memory/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`agents-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
