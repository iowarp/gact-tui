import { expect, test } from '@playwright/test';
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
    await page.getByRole('button', { name: /Private local marketplace/ }).click();
    await expect(
      page.getByText('D:/CLIO/config/plugins/user-agents', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Dememory Clio', { exact: true })).toBeVisible();
    await page.getByText('Saved definition: user/dememory-clio').click();
    await expect(
      page.getByText('D:/CLIO/config/plugins/user-agents/dememory-clio.json'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Back up/ })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`local-marketplace-${width}.png`) });

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
