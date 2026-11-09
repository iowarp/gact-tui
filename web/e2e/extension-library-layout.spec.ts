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
  test(`private agent sources at ${width}px`, async ({ page }, testInfo) => {
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
    // The preview resolves the private agent; reuse a built-in resolution under its name.
    await page.route('**/v1/agents/resolve?*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('ref') !== 'user/dememory-clio') return route.fallback();
      url.searchParams.set('ref', 'clio/default');
      const data = await (await route.fetch({ url: url.toString() })).json();
      await route.fulfill({
        json: {
          ...data,
          agent: {
            ...data.agent,
            ref: 'user/dememory-clio',
            id: definition.id,
            name: definition.name,
            description: definition.description,
            parent: definition.extends,
            kind: 'user',
          },
        },
      });
    });
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

    await page.goto('/settings/agents');
    const agent = page.locator('[data-agent-ref="user/dememory-clio"]');
    await expect(agent).toBeVisible();
    await agent.hover();
    await agent.getByRole('button', { name: 'Explore Dememory Clio' }).click();
    await expect(page.getByRole('complementary', { name: 'Dememory Clio' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`agents-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
