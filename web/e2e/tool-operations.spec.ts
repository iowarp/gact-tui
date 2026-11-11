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
// A batch of installed skill files: they live with the app, outside every workspace.
const skillRoot =
  '/Applications/CLIO Desktop.app/Contents/Resources/gact-runtime/clio_schemas/skills/work-with-ndp';
const skillFiles = Array.from({ length: 12 }, (_, i) =>
  i % 3 === 2
    ? `catalog.json#/components/Widget${i + 1}`
    : `references/observation-guide-${i + 1}.md`,
);
const skillBatch: ToolInvocation = {
  id: 'skill',
  name: 'load_skill',
  session_id: 'parent',
  state: 'succeeded',
  input: { skill_id: 'work-with-ndp', files: skillFiles },
  presentation: {
    action: 'Read skill references',
    subject: 'skill-reference',
    summary: 'Work with NDP',
    blocks: [
      { id: 'skill-reference', type: 'text', text: `${skillFiles.length} reference files` },
      { id: 'skill-identity', type: 'text', label: 'Skill', text: 'work-with-ndp' },
      { id: 'skill-directory', type: 'text', label: 'Skill directory', text: skillRoot },
      ...skillFiles.map((file, i) => ({
        id: `skill-file-${i}`,
        type: 'link' as const,
        target: 'file' as const,
        uri: `${skillRoot}/${file.split('#')[0]}`,
        label: file,
      })),
      {
        id: 'content',
        type: 'markdown',
        text: skillFiles
          .map(
            (file, i) =>
              `=== File ${i + 1}/${skillFiles.length}: ${file} ===\n` +
              (file.startsWith('catalog')
                ? JSON.stringify({ title: `Widget ${i + 1}`, properties: { data: 'ref' } }, null, 2)
                : `# Observation guide ${i + 1}\n\n${'Compare each station window with its calibration record. '.repeat(40)}`),
          )
          .join('\n\n'),
      },
    ],
  },
};
// The finished audit child's only recorded call, served from its transcript page.
const childCall: ToolInvocation = {
  ...tool('child-read', 'fs_read_file', { path: '/workspace/observations.csv' }, 'id,value\n'),
  session_id: 'child-audit',
};
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
    skillBatch,
    {
      ...tool('skill-running', 'load_skill', { skill_id: 'work-with-ndp' }, null),
      state: 'running',
    },
    {
      ...tool(
        'skill-failed',
        'load_skill',
        { skill_id: 'work-with-ndp', file: 'missing.md' },
        null,
      ),
      state: 'failed',
      error: "bundled file 'missing.md' not found in skill 'work-with-ndp'",
    },
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
      const url = new URL(route.request().url());
      requests.push(`${url.pathname}${url.search}`);
      return route.fulfill({
        json: url.pathname.endsWith('/messages') ? { messages: [], tools: [childCall] } : {},
      });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/review/tool-operations.html');
    await expect(page.getByRole('heading', { name: 'Tool operation review' })).toBeVisible();
    const row = (id: string) => page.locator(`#tool-${id}`);
    // Phone rows hide the action name; the leading disclosure opens them there.
    const opener = (id: string, label: string) =>
      row(id).getByRole('button', {
        name: width < 480 ? `Expand ${label}` : `Show result for ${label}`,
        exact: true,
      });
    const waitName = row('waiting').locator('[data-slot="tool-action-text"]');
    await expect(waitName).toHaveAttribute('aria-label', 'Show result for Wait for');
    await expect(waitName).toBeDisabled();
    await expect(row('waiting').getByRole('button', { name: /Expand/ })).toHaveCount(0);
    await expect(row('waiting')).toContainText('0 returned, 2 running');
    expect(requests).toEqual([]);
    await row('delegate').getByRole('button', { name: 'Independent audit', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Opened entity' })).toHaveText('child-audit');
    await expect(row('delegate').getByRole('region')).toHaveCount(0);
    await opener('delegate', 'Delegate').click();
    await expect(row('delegate')).toContainText(
      'Check the package against the original observations.',
    );
    // Opening a delegate reads its child's newest bounded page once: nothing is
    // read on render, and a finished child is never polled.
    await expect(
      row('delegate').getByRole('group', { name: 'Calls by Independent audit' }),
    ).toContainText('observations.csv');
    const childPage = ['/v1/sessions/child-audit/messages?limit=40'];
    expect(requests).toEqual(childPage);
    await opener('returned', 'Wait for').click();
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
    await opener('search', 'Search tasks').click();
    await expect(row('search')).toContainText('calibration');
    await expect(row('search').getByText('Calibration review 9', { exact: true })).toHaveCount(0);
    await row('search').getByRole('button', { name: 'Next', exact: true }).click();
    await expect(row('search')).toContainText('9–16 of 96');
    await expect(row('search').getByText('Calibration review 9', { exact: true })).toBeVisible();
    await opener('models', 'Find models').click();
    await expect(row('models').getByRole('row')).toHaveCount(13);
    await expect(row('models').getByText('Model 13', { exact: true })).toHaveCount(0);
    await row('models').getByRole('button', { name: 'Next', exact: true }).click();
    await expect(row('models').getByText('Model 13', { exact: true })).toBeVisible();
    // Installed skill files open from the text this call loaded, not the workspace reader.
    await opener('skill', 'Read skill references').click();
    await row('skill').getByText('Source', { exact: true }).click();
    await row('skill').getByRole('button', { name: 'catalog.json#/components/Widget6' }).click();
    const skillFile = page.getByRole('dialog', { name: 'catalog.json#/components/Widget6' });
    await expect(skillFile).toContainText('"title": "Widget 6"');
    await expect(skillFile).not.toContainText('Widget 9');
    // Every kind of skill file gets the same copy and download actions.
    await expect(skillFile.getByRole('button', { name: 'Download catalog.json' })).toBeVisible();
    await expect(
      skillFile.getByRole('button', { name: 'Copy catalog.json#/components/Widget6' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await row('skill').getByRole('button', { name: 'references/observation-guide-11.md' }).click();
    const guide = page.getByRole('dialog', { name: 'observation-guide-11.md' });
    await expect(guide.getByRole('heading', { name: 'Observation guide 11' })).toBeVisible();
    await expect(guide.getByText('work-with-ndp › references', { exact: true })).toHaveAttribute(
      'title',
      `${skillRoot}/references/observation-guide-11.md`,
    );
    await expect(
      guide.getByRole('button', { name: 'Download observation-guide-11.md' }),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`skill-file-${width}.png`) });
    expect(await guide.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThan(2);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Opened entity' })).toHaveText('child-audit');
    await opener('skill-failed', 'Load skill').click();
    await expect(row('skill-failed')).toContainText("bundled file 'missing.md' not found");
    await expect(row('skill-running')).toContainText('Load skill');
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
    expect(requests).toEqual(childPage);
    await page.getByRole('button', { name: 'Expand all', exact: true }).click();
    await expect(
      row('returned').getByRole('heading', { name: 'Build package report' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`operations-${width}.png`) });
  });
}
