import { expect, test } from '@playwright/test';
import type { ToolInvocation } from '@clio/core/v3';

const report = (name: string) =>
  `# ${name}\n\n${'Verified the retained observations against the supplied rules. '.repeat(300)}`;
const tool = (id: string, name: string, input: unknown, output: unknown): ToolInvocation => ({
  id,
  name,
  input,
  output,
  session_id: 'parent',
  state: 'succeeded',
});
const fixture = {
  subagents: {
    build: {
      id: 'build',
      session_id: 'parent',
      child_session_id: 'child-build',
      title: 'Build package',
      state: 'completed',
    },
    audit: {
      id: 'audit',
      session_id: 'parent',
      child_session_id: 'child-audit',
      title: 'Independent audit',
      state: 'completed',
    },
  },
  tools: [
    tool(
      'delegate',
      'spawn_agent_task',
      {
        name: 'Independent audit',
        agent: 'standard',
        model: 'model-review',
        task: 'Check the package against the original observations.\n'.repeat(200),
      },
      { handle: 'audit', session_id: 'child-audit' },
    ),
    tool(
      'waiting',
      'wait_tasks',
      { tasks: ['build', 'audit'] },
      { outcomes: [], pending: ['build', 'audit'] },
    ),
    tool(
      'returned',
      'wait_tasks',
      { tasks: ['build', 'audit'] },
      {
        outcomes: [
          { handle: 'build', result: { answer: report('Build package report') } },
          { handle: 'audit', result: { answer: report('Independent audit report') } },
        ],
        pending: [],
      },
    ),
    tool(
      'search',
      'query_tasks',
      { query: 'calibration', scope: 'conversation', status: 'completed' },
      {
        matches: Array.from({ length: 96 }, (_, i) => ({
          name: `Calibration review ${i + 1}`,
          excerpt: `Station ${i + 1} calibration window was checked against the recorded observations.`,
        })),
      },
    ),
    tool(
      'models',
      'list_models',
      {},
      {
        models: Array.from({ length: 128 }, (_, i) => ({
          name: `Model ${i + 1}`,
          context: 32000,
          vision: i % 2 === 0,
          tools: true,
          notes: 'Recorded provider capabilities',
        })),
      },
    ),
  ],
};

for (const width of [1440, 390]) {
  test(`shared operations preserve names, content and bounded disclosure at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/__test/operation-tools', (route) => route.fulfill({ json: fixture }));
    await page.route('**/v1/**', (route) => {
      requests.push(route.request().url());
      return route.fulfill({ json: {} });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/review/tool-operations.html');
    await expect(page.getByRole('heading', { name: 'Tool operation review' })).toBeVisible();
    const row = (id: string) => page.locator(`#tool-${id}`);
    await expect(
      row('waiting').getByRole('button', { name: 'Show result for Wait for' }),
    ).toBeDisabled();
    await expect(row('waiting').getByRole('button', { name: /Expand/ })).toHaveCount(0);
    await expect(row('waiting')).toContainText('(0 returned, 2 running)');
    expect(requests).toEqual([]);
    await row('delegate').getByRole('button', { name: 'Independent audit', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Opened entity' })).toHaveText('child-audit');
    await expect(row('delegate').getByRole('region')).toHaveCount(0);
    await row('delegate')
      .getByRole('button', { name: 'Show result for Delegate to', exact: true })
      .click();
    await expect(row('delegate')).toContainText('running as standard on model-review');
    await expect(row('delegate')).toContainText(
      'Check the package against the original observations.',
    );
    await row('returned')
      .getByRole('button', { name: 'Show result for Wait for', exact: true })
      .click();
    await expect(
      row('returned').getByRole('heading', { name: 'Build package report' }),
    ).toBeVisible();
    await row('returned').getByRole('tab', { name: 'Independent audit', exact: true }).click();
    await expect(
      row('returned').getByRole('heading', { name: 'Independent audit report' }),
    ).toBeVisible();
    await expect(
      row('returned').getByRole('heading', { name: 'Build package report' }),
    ).toHaveCount(0);
    await expect(row('returned')).not.toContainText('Return when all');
    await row('search')
      .getByRole('button', { name: 'Show result for Search tasks', exact: true })
      .click();
    await expect(row('search')).toContainText('calibration');
    await expect(row('search').getByText('Calibration review 9', { exact: true })).toHaveCount(0);
    await row('search').getByRole('button', { name: 'Next', exact: true }).click();
    await expect(row('search')).toContainText('9–16 of 96');
    await expect(row('search').getByText('Calibration review 9', { exact: true })).toBeVisible();
    await row('models')
      .getByRole('button', { name: 'Show result for Find models', exact: true })
      .click();
    await expect(row('models').getByRole('row')).toHaveCount(13);
    await expect(row('models').getByText('Model 13', { exact: true })).toHaveCount(0);
    await row('models').getByRole('button', { name: 'Next', exact: true }).click();
    await expect(row('models').getByText('Model 13', { exact: true })).toBeVisible();
    const info = row('returned').getByRole('button', { name: 'Technical details for Wait for' });
    await info.click();
    await expect(page.getByRole('dialog')).toContainText('"tasks"');
    await page.keyboard.press('Escape');
    await expect(info).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThan(2);
    expect(
      await row('returned')
        .locator('[data-slot=transcript-tool-details]')
        .evaluateAll((nodes) => nodes.some((node) => getComputedStyle(node).overflowY === 'auto')),
    ).toBe(false);
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
    await page.getByRole('button', { name: 'Expand all', exact: true }).click();
    await expect(
      row('returned').getByRole('heading', { name: 'Build package report' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`operations-${width}.png`) });
  });
}
