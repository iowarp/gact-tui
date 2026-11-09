import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Real CLIO and real recorded model responses; no route interception or injected transcript. */
test('fork checkpoint, family Gantt, relationship navigation and output lineage', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const endpoint = process.env['CLIO_ENDPOINT'] ?? 'http://127.0.0.1:17963';
  const out = process.env['CLIO_CONVERSATION_CAPTURE_DIR'];
  const statePath = process.env['CLIO_CONVERSATION_STATE'];
  expect(out).toBeTruthy();
  expect(statePath).toBeTruthy();
  const state = JSON.parse(await readFile(statePath!, 'utf8')) as {
    workspace: string;
    sessions: Record<string, string>;
    reference_state?: string;
  };
  const reference = state.reference_state
    ? (JSON.parse(await readFile(state.reference_state, 'utf8')) as typeof state)
    : state;
  await mkdir(path.join(out!, 'originals'), { recursive: true });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.addInitScript((endpoint) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  const capture = async (name: string, selector?: string) => {
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15000 });
    await page.screenshot({ path: path.join(out!, 'originals', `${name}.png`) });
    if (selector) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds).toBeTruthy();
      await page.screenshot({
        path: path.join(out!, `${name}.png`),
        clip: {
          x: 0,
          y: 0,
          width: page.viewportSize()!.width,
          height: Math.min(page.viewportSize()!.height, Math.ceil(bounds!.y + bounds!.height + 16)),
        },
      });
    } else
      await page.screenshot({
        path: path.join(out!, `${name}.png`),
        clip: { x: 248, y: 0, width: 1192, height: 840 },
      });
  };
  await page.goto(
    `/workspaces/${reference.workspace}/sessions/${reference.sessions['Offset comparison']}`,
  );
  await expect(page.getByRole('combobox', { name: /^Ask .+ to investigate/ })).toBeVisible();
  const log = page.getByRole('log', { name: 'Conversation' });
  await log.evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }));
  const checkpoint = page.getByRole('separator', { name: 'Conversation branched here' });
  await checkpoint.scrollIntoViewIfNeeded();
  await expect(checkpoint).toHaveCount(1);
  await expect(checkpoint).toContainText('History above was copied.');
  await expect(checkpoint.getByRole('link', { name: 'Calibration baseline' })).toHaveAttribute(
    'href',
    /#message-/,
  );
  await page.goto(
    `/workspaces/${reference.workspace}/sessions/${reference.sessions['Offset sensitivity']}`,
  );
  await expect(checkpoint.getByRole('link', { name: 'Offset comparison' })).toBeVisible();
  await checkpoint.scrollIntoViewIfNeeded();
  await page.mouse.move(900, 400);
  await page.mouse.wheel(0, 40);
  await expect(checkpoint).toBeInViewport();
  await capture('docs-fork-checkpoint');
  await page.goto(`/workspaces/${state.workspace}/sessions/${state.sessions['Offset comparison']}`);
  await checkpoint.scrollIntoViewIfNeeded();
  await expect(checkpoint).toHaveCount(1);
  await page.goto(`/workspaces/${state.workspace}/sessions/${state.sessions['Offset comparison']}`);
  await page.getByRole('button', { name: /^Evidence layout:/ }).click();
  await page.getByRole('button', { name: 'Open full details', exact: true }).click();
  await page.getByRole('button', { name: 'Maximize canvas', exact: true }).click();
  await page.getByRole('tab', { name: 'Gantt', exact: true }).click();
  const gantt = page.getByRole('region', { name: 'Conversation family Gantt' });
  await expect(gantt).toBeVisible();
  await expect(gantt.locator('[data-event-id^="turn:"]')).toHaveCount(8, { timeout: 15000 });
  await expect(gantt.locator('[data-relationship="parent-activity"]')).toHaveCount(4);
  const ganttAnchors = await gantt.evaluate((element) =>
    [...element.querySelectorAll<SVGGElement>('[data-relationship="parent-activity"]')].map(
      (edge) => {
        const target = element.querySelector<HTMLElement>(
          `[data-event-id="${edge.dataset.targetId}"]`,
        )!;
        const arrow = edge.querySelectorAll<SVGPathElement>('path')[1]!;
        const point = arrow.getPointAtLength(0);
        const transformed = new DOMPoint(point.x, point.y).matrixTransform(arrow.getScreenCTM()!);
        const bounds = target.getBoundingClientRect();
        return {
          target: edge.dataset.targetId,
          dx: Math.abs(transformed.x - bounds.left),
          dy: Math.abs(transformed.y - (bounds.top + bounds.height / 2)),
        };
      },
    ),
  );
  await writeFile(
    path.join(out!, 'gantt-layout.json'),
    JSON.stringify(
      await gantt.evaluate((element) => {
        const svg = element.querySelector<SVGSVGElement>('[data-slot="gantt-dependencies"]')!;
        const parents = [];
        let node: Element | null = svg;
        while (node && parents.length < 8) {
          parents.push({
            tag: node.tagName,
            slot: node.getAttribute('data-slot'),
            style: node.getAttribute('style'),
            class: node.getAttribute('class'),
            bounds: node.getBoundingClientRect().toJSON(),
            scrollLeft: node.scrollLeft,
          });
          node = node.parentElement;
        }
        return {
          parents,
          matrix: svg.getScreenCTM()?.toString(),
          viewBox: svg.getAttribute('viewBox'),
        };
      }),
      null,
      2,
    ),
  );
  expect(
    ganttAnchors.every((anchor) => anchor.dx <= 2 && anchor.dy <= 2),
    JSON.stringify(ganttAnchors),
  ).toBe(true);
  const visibleRows = await gantt.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll('[data-event-id]')].every((bar) => {
      const b = bar.getBoundingClientRect();
      return b.top >= bounds.top && b.bottom <= bounds.bottom;
    });
  });
  expect(visibleRows, 'Every conversation activity row fits the chart').toBe(true);
  await expect(
    gantt.getByRole('link', { name: 'Open user fork: Offset comparison' }),
  ).toHaveAttribute('href', new RegExp(state.sessions['Offset comparison']));
  await expect(gantt.getByRole('link', { name: 'Open subagent: Calibration check' })).toBeVisible();
  await expect(gantt.locator('[data-relation-kind="fork"] path[stroke-dasharray]')).toHaveCount(0);
  await expect(
    gantt.locator('[data-relation-kind="delegation"] path[stroke-dasharray]'),
  ).toHaveCount(1);
  const timingResponse = await page.request.get(
    endpoint +
      '/v1/sessions/' +
      state.sessions['baseline'] +
      '/provenance/execution?provider=native&include_children=true&limit=10000',
  );
  const timing = (await timingResponse.json()) as {
    spans: { id: string; owner_session_id: string; event_type: string }[];
  };
  const flaggedTurn = timing.spans.find(
    (span) =>
      span.owner_session_id === state.sessions['Flagged reading comparison'] &&
      span.event_type === 'turn.started',
  )!;
  await gantt.locator('[data-event-id="turn:' + flaggedTurn.id + '"]').click();
  await expect(page.getByRole('complementary', { name: 'Selected conversation' })).toContainText(
    '11',
  );
  await capture('docs-conversation-family-gantt', '[aria-label="Conversation family Gantt"]');
  await page.getByRole('button', { name: 'Switch to Relationships' }).click();
  const graph = page.getByRole('region', { name: 'Conversation relationship graph' });
  await expect(graph.locator('.react-flow__node')).toHaveCount(5);
  await expect(graph.locator('.react-flow__edge')).toHaveCount(4);
  await page.getByRole('button', { name: 'Select Offset sensitivity' }).click();
  const inspector = page.getByRole('complementary', { name: 'Selected conversation' });
  await expect(
    inspector.getByRole('link', { name: 'Open conversation', exact: true }),
  ).toHaveAttribute('href', new RegExp(state.sessions['Offset sensitivity']));
  await page.getByRole('button', { name: 'Switch to Gantt' }).click();
  await expect(gantt).toBeVisible();
  await page.getByRole('button', { name: 'Switch to Relationships' }).click();
  await expect(page.getByRole('button', { name: 'Select Offset sensitivity' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Select Offset comparison' }).click();

  const graphAnchors = await graph.evaluate((element) =>
    [...element.querySelectorAll<SVGGElement>('.react-flow__edge')].map((edge) => {
      const [sourceId, targetId] = edge.getAttribute('data-id')!.split(':');
      const source = element
        .querySelector(`[data-id="${sourceId}"] .react-flow__handle.source`)!
        .getBoundingClientRect();
      const target = element
        .querySelector(`[data-id="${targetId}"] .react-flow__handle.target`)!
        .getBoundingClientRect();
      const line = edge.querySelector<SVGPathElement>('.react-flow__edge-path')!;
      const start = line.getPointAtLength(0);
      const end = line.getPointAtLength(line.getTotalLength());
      const matrix = line.getScreenCTM()!;
      const a = new DOMPoint(start.x, start.y).matrixTransform(matrix);
      const b = new DOMPoint(end.x, end.y).matrixTransform(matrix);
      return {
        sourceId,
        targetId,
        sourceGap: Math.hypot(a.x - (source.left + source.width / 2), a.y - source.bottom),
        targetGap: Math.hypot(b.x - (target.left + target.width / 2), b.y - target.top),
      };
    }),
  );
  expect(
    graphAnchors.every((anchor) => anchor.sourceGap < 4 && anchor.targetGap < 4),
    JSON.stringify(graphAnchors),
  ).toBe(true);
  await page.getByRole('button', { name: 'Select Offset sensitivity' }).click();
  await expect(inspector.getByLabel('Conversation preview')).toContainText('14');
  await expect(inspector.getByLabel('Conversation preview')).toContainText('17');
  const columns = await page
    .getByRole('region', { name: 'Conversation relationships' })
    .evaluate((element) => {
      const header = element
        .querySelector('[data-slot="conversation-work-header"]')!
        .getBoundingClientRect();
      const inspector = element.querySelector('aside')!.getBoundingClientRect();
      return {
        topGap: Math.abs(header.top - inspector.top),
        overlap: header.right > inspector.left + 1,
      };
    });
  expect(columns.topGap).toBeLessThan(2);
  expect(columns.overlap).toBe(false);
  await page.getByRole('button', { name: 'Select Flagged reading comparison' }).click();
  await expect(inspector.getByLabel('Conversation preview')).toContainText('11');
  await capture('docs-conversation-relationships', '[aria-label="Conversation relationships"]');
  await page.getByRole('button', { name: 'Select Calibration check' }).click();
  await expect(inspector).toContainText('Subagent');
  await expect(inspector.getByRole('link', { name: 'Open subagent', exact: true })).toHaveAttribute(
    'href',
    new RegExp(state.sessions['Calibration check']),
  );
  await page.getByRole('button', { name: 'Select Offset comparison' }).click();
  for (const width of [1024, 736, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: 'Switch to Gantt' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select Offset comparison' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect
      .poll(
        () =>
          graph.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return [...element.querySelectorAll('.react-flow__node')].every((node) => {
              const b = node.getBoundingClientRect();
              return b.left >= bounds.left && b.right <= bounds.right;
            });
          }),
        { message: 'Fit keeps all graph nodes inside the resized canvas' },
      )
      .toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: path.join(out!, `relationships-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.goto(
    `/workspaces/${reference.workspace}/sessions/${reference.sessions['Offset comparison']}`,
  );
  await page.getByRole('button', { name: /^Evidence layout:/ }).click();
  await page.getByRole('button', { name: 'Open full details', exact: true }).click();
  await page.getByRole('tab', { name: 'Gantt', exact: true }).click();
  const toRelationships = page.getByRole('button', { name: 'Switch to Relationships' });
  if (await toRelationships.isVisible()) await toRelationships.click();
  await page.getByRole('button', { name: 'Select Offset comparison' }).click();
  await inspector.getByRole('button', { name: 'calibration-offset.md', exact: true }).click();
  const maximize = page.getByRole('button', { name: 'Maximize canvas', exact: true });
  if (await maximize.isVisible()) await maximize.click();
  await page.setViewportSize({ width: 1440, height: 650 });
  await page.getByRole('tab', { name: 'Lineage', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Artifact lineage graph' })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Artifact lineage graph' })
      .getByText('calibration-baseline.md', { exact: true }),
  ).toBeVisible();
  await capture('docs-conversation-output-lineage', '[aria-label="Artifact lineage graph"]');
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await page.getByRole('button', { name: 'Select Offset sensitivity' }).click();
  await inspector.getByRole('link', { name: 'Open conversation', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/sessions/${reference.sessions['Offset sensitivity']}$`),
  );
  await expect(page.getByRole('combobox', { name: /^Ask .+ to investigate/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: /^Ask .+ to investigate/ })).toBeVisible();
  await page.getByRole('button', { name: /^Evidence layout:/ }).click();
  await page.getByRole('button', { name: 'Open full details', exact: true }).click();
  await page.getByRole('tab', { name: 'Gantt', exact: true }).click();
  const switchBack = page.getByRole('button', { name: 'Switch to Gantt' });
  if (await switchBack.isVisible()) await switchBack.click();
  await page.getByRole('link', { name: 'Open user fork: Offset comparison', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${reference.sessions['Offset comparison']}$`));
  expect(pageErrors).toEqual([]);
  await writeFile(
    path.join(out!, 'browser-verdict.json'),
    JSON.stringify(
      {
        passed: true,
        ganttAnchors,
        graphAnchors,
        pageErrors,
        widths: [1440, 1024, 736, 390],
        cases: [
          'checkpoint and reload',
          'real recorded family timing',
          'connected Gantt arrows',
          'graph ports aligned',
          'toggle preserves selection',
          'responsive layout',
          'real output lineage',
          'nested conversation navigation and reload',
        ],
      },
      null,
      2,
    ),
  );
});
