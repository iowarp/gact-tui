import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`edits finite and unlimited subagent controls at ${width}px`, async ({ page }) => {
    let revision = 0;
    const rows = [
      {
        key: 'agent_tasks.max_concurrent',
        title: 'Concurrent subagents',
        value: 3,
        description:
          'Maximum running child tasks at each nesting level across this service. Extra tasks queue. Agent-specific limits may be lower.',
        effect: 'Applies immediately. Running tasks finish; queued tasks use the new limit.',
      },
      {
        key: 'agent_tasks.max_depth',
        title: 'Maximum nesting depth',
        value: 8,
        description: 'How many levels of subagents may be created. The first child is level 1.',
        effect: 'Applies to new subagents immediately. Existing descendants remain visible.',
      },
    ].map((row) => ({
      ...row,
      default_value: row.value,
      group: 'Subagents',
      kind: 'integer',
      minimum: 0,
      maximum: null,
      unit: null,
      source: 'default',
      has_user_value: false,
      editable: true,
      reason: null,
      unlimited_value: 0,
    }));
    await page.route('**/v1/settings/runtime', async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        expect(body.revision).toBe(String(revision));
        for (const row of rows) {
          if (Object.hasOwn(body.changes, row.key)) {
            row.value = body.changes[row.key];
            row.source = 'user';
            row.has_user_value = true;
          }
        }
        revision++;
      }
      await route.fulfill({
        json: { revision: String(revision), config_path: '/review/config.yaml', settings: rows },
      });
    });
    await page.route('**/v1/lm/configuration', (route) =>
      route.fulfill({
        json: {
          configured: false,
          provider: '',
          provider_id: '',
          model: '',
          api_base: '',
          presets: [],
        },
      }),
    );
    let savedParallelism: number | undefined;
    await page.route('**/v1/agents/reviewer', async (route) => {
      const agent = route.request().postDataJSON();
      savedParallelism = agent.fanout.max_workers;
      await route.fulfill({ json: agent });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/review/runtime-limits.html');
    const concurrent = page.getByRole('spinbutton', { name: 'Concurrent subagents' });
    const depth = page.getByRole('spinbutton', { name: 'Maximum nesting depth' });
    await expect(concurrent).toHaveValue('3');
    await expect(depth).toHaveValue('8');
    await page.screenshot({ path: test.info().outputPath(`runtime-limits-finite-${width}.png`) });
    await page.getByRole('switch', { name: 'Unlimited concurrent subagents' }).click();
    await page.getByRole('switch', { name: 'Unlimited maximum nesting depth' }).click();
    await expect(concurrent).toBeDisabled();
    await expect(depth).toBeDisabled();
    await page.getByRole('button', { name: 'Save defaults' }).click();
    await expect(page.getByRole('button', { name: 'Save defaults' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save defaults' })).toHaveText('Save defaults');
    expect(rows.map((row) => row.value)).toEqual([0, 0]);
    await page.screenshot({
      path: test.info().outputPath(`runtime-limits-unlimited-${width}.png`),
    });
    await page.getByRole('switch', { name: 'Unlimited maximum nesting depth' }).click();
    await expect(depth).toHaveValue('8');
    await depth.fill('12');
    await page.getByRole('button', { name: 'Save defaults' }).click();
    await expect(page.getByRole('button', { name: 'Save defaults' })).toBeDisabled();
    expect(rows[1]!.value).toBe(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Edit Reviewer' }).click();
    const parallel = page.getByRole('spinbutton', { name: 'Per-agent parallelism' });
    await expect(parallel).toHaveValue('2');
    await parallel.scrollIntoViewIfNeeded();
    await page.getByRole('switch', { name: 'Unlimited per-agent parallelism' }).click();
    await expect(parallel).toBeDisabled();
    const unlimited = page.getByRole('switch', { name: 'Unlimited per-agent parallelism' });
    await expect(unlimited).toBeChecked();
    await unlimited.evaluate(async (node) => {
      await new Promise(requestAnimationFrame);
      await Promise.all(
        node.getAnimations({ subtree: true }).map((animation) => animation.finished),
      );
    });
    await page.screenshot({ path: test.info().outputPath(`agent-parallelism-${width}.png`) });
    await page.getByRole('button', { name: 'Save agent' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(savedParallelism).toBe(0);
    await page.getByRole('button', { name: 'Edit Reviewer' }).click();
    await expect(
      page.getByRole('switch', { name: 'Unlimited per-agent parallelism' }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.reload();
    await expect(
      page.getByRole('switch', { name: 'Unlimited concurrent subagents' }),
    ).toBeChecked();
    await expect(page.getByRole('spinbutton', { name: 'Maximum nesting depth' })).toHaveValue('12');
  });
}
