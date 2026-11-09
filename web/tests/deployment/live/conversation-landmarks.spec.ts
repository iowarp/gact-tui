import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Real service, recorded public calibration example; no intercepted routes or model substitutes.
 * CLIO_LANDMARK_TRANSCRIPT points to the real-model recording from conversation-controls acceptance.
 */
test('durable conversation marks, previews, cross-client updates and history boundaries', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const endpoint = process.env['CLIO_ENDPOINT'] ?? 'http://127.0.0.1:17961';
  const out = process.env['CLIO_LANDMARK_CAPTURE_DIR'];
  const transcript = process.env['CLIO_LANDMARK_TRANSCRIPT'];
  expect(out, 'Set CLIO_LANDMARK_CAPTURE_DIR').toBeTruthy();
  expect(
    transcript,
    'Set CLIO_LANDMARK_TRANSCRIPT to the public calibration recording',
  ).toBeTruthy();
  await mkdir(path.join(out!, 'originals'), { recursive: true });
  const api = async (method: string, route: string, data?: unknown) => {
    const response = await page.request.fetch(endpoint + route, { method, data });
    expect(response.ok(), `${method} ${route}: ${response.status()} ${await response.text()}`).toBe(
      true,
    );
    return response.json();
  };
  await api('PUT', '/v1/providers/lm', { provider: 'codex', model: 'gpt-6-luna', api_base: '' });
  const recorded = JSON.parse(await readFile(transcript!, 'utf8')) as {
    id: string;
    role: string;
  }[];
  const imported = await api('POST', '/v1/sessions/import', {
    session: { title: 'Calibration methods' },
    messages: recorded,
  });
  const sid = imported.id as string;
  await api('PATCH', `/v1/sessions/${sid}`, {
    model: { provider_id: 'codex', model_id: 'gpt-6-luna' },
  });
  const first = recorded[0]!;
  const second = recorded[3]!;
  const last = recorded.at(-1)!;
  await page.setViewportSize({ width: 1440, height: 900 });
  await context.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  const url = `/workspaces/${imported.workspace_id}/sessions/${sid}`;
  await page.goto(url);
  const openOutline = async (target: typeof page) => {
    await target.getByRole('button', { name: 'Open transcript outline' }).click();
    return target.getByRole('dialog', { name: 'Transcript outline' });
  };
  /** The outline filtered to marked messages, once it shows `count` of them. */
  const openMarked = async (target: typeof page, count: number) => {
    const list = await openOutline(target);
    const filter = list.getByRole('button', { name: `Marked (${count})` });
    await expect(filter).toBeVisible();
    if ((await filter.getAttribute('aria-pressed')) !== 'true') await filter.click();
    return list;
  };
  const outline = await openOutline(page);
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByRole('button', { name: 'Open transcript outline' })).toBeVisible();

  await outline.getByRole('button', { name: 'Jump to user message 1' }).hover();
  const preview = page.getByRole('region', { name: 'user message 1 preview' });
  await expect(preview.locator('.font-semibold')).toBeVisible();
  await expect(preview).toContainText('Mean: 12');
  await preview.getByRole('button', { name: 'Mark message', exact: true }).click();
  await expect(preview.getByRole('button', { name: 'Unmark message' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await openMarked(other, 1);
  await other.keyboard.press('Escape');
  expect((await api('GET', `/v1/sessions/${sid}`)).metadata.message_marks).toEqual({
    [first.id]: true,
  });

  const capture = async (name: string, locator: typeof preview) => {
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    await page.screenshot({ path: path.join(out!, 'originals', name) });
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    const outlineBox = await outline.boundingBox();
    const left = Math.max(0, Math.min(outlineBox?.x ?? box!.x, box!.x) - 8);
    const top = name.includes('preview') ? Math.max(0, box!.y - 12) : 0;
    await page.screenshot({
      path: path.join(out!, name),
      clip: {
        x: left,
        y: top,
        width: box!.x + box!.width + 12 - left,
        height: box!.y + box!.height + 12 - top,
      },
    });
  };
  await capture('docs-message-preview.png', preview);
  await page.mouse.move(1200, 30);
  await page.keyboard.press('Escape');
  const marked = await openMarked(page, 1);
  await expect(marked.getByRole('button', { name: 'Jump to user message 1' })).toBeVisible();
  await marked.getByRole('button', { name: 'Jump to user message 1' }).click();
  await expect(page.locator(`[data-message-id="${first.id}"]`).first()).toBeVisible();
  await page.reload();
  await openMarked(page, 1);
  await page.keyboard.press('Escape');

  // The second client changes another ID through its real message action.
  await (await openOutline(other))
    .getByRole('button', { name: 'Jump to assistant message 4' })
    .click();
  const secondRow = other.locator(`[data-message-id="${second.id}"]`).first();
  await secondRow.getByRole('button', { name: 'Mark message', exact: true }).click();
  await openMarked(other, 2);
  await other.keyboard.press('Escape');
  await openMarked(page, 2);
  await capture('docs-marked-messages.png', marked);
  await marked.getByRole('button', { name: 'Jump to assistant message 4' }).click();
  await expect(page.locator(`[data-message-id="${second.id}"]`).first()).toBeVisible();
  const exported = await api('GET', `/v1/sessions/${sid}/export`);
  expect(exported.session.metadata.message_marks).toEqual({ [first.id]: true, [second.id]: true });
  const restored = await api('POST', '/v1/sessions/import', exported);
  expect(restored.metadata.message_marks).toEqual(exported.session.metadata.message_marks);
  const fork = await api('POST', `/v1/sessions/${sid}/fork`, { at_message_id: first.id });
  expect(fork.metadata.message_marks).toEqual({ [first.id]: true });
  await api('PATCH', `/v1/sessions/${fork.id}`, {
    metadata: { message_marks: { [first.id]: false } },
  });
  expect((await api('GET', `/v1/sessions/${sid}`)).metadata.message_marks).toEqual(
    exported.session.metadata.message_marks,
  );
  await api('PATCH', `/v1/sessions/${sid}`, { metadata: { message_marks: { [last.id]: true } } });
  await api('POST', `/v1/sessions/${sid}/rewind`, { message_id: second.id });
  expect((await api('GET', `/v1/sessions/${sid}`)).metadata.message_marks).toEqual(
    exported.session.metadata.message_marks,
  );
  await page.setViewportSize({ width: 720, height: 900 });
  await openMarked(page, 2);
  await expect(outline.getByRole('button', { name: 'Jump to assistant message 4' })).toBeVisible();
  await page.screenshot({ path: path.join(out!, 'originals', 'narrow-marked-outline.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controlDir = path.dirname(out!);
  const beforeRestart = JSON.parse(await readFile(path.join(controlDir, 'server.json'), 'utf8'))
    .restart_count as number;
  await writeFile(path.join(controlDir, 'restart.request'), 'Verify durable marks');
  await expect
    .poll(
      async () => {
        const state = JSON.parse(await readFile(path.join(controlDir, 'server.json'), 'utf8'));
        if (state.restart_count <= beforeRestart) return false;
        try {
          const response = await page.request.get(`${endpoint}/v1/sessions/${sid}`, {
            timeout: 2000,
          });
          if (!response.ok()) return false;
          const saved = (await response.json()).metadata.message_marks;
          const expected = exported.session.metadata.message_marks;
          return (
            Object.keys(saved).length === Object.keys(expected).length &&
            Object.entries(expected).every(([id, value]) => saved[id] === value)
          );
        } catch {
          return false;
        }
      },
      { timeout: 60_000, intervals: [1000] },
    )
    .toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Open transcript outline' }).click();
  await expect(outline.getByRole('button', { name: 'Marked (2)' })).toBeVisible();
  await other.close();
  await writeFile(
    path.join(out!, 'browser-verdict.json'),
    JSON.stringify(
      {
        passed: true,
        service: endpoint,
        session_id: sid,
        source: transcript,
        source_kind: 'recorded real Luna responses with fictional calibration readings',
        verified: [
          'bold preview with answer excerpt',
          'mark from hover without jumping',
          'cross-client SSE update',
          'mark from message action',
          'reload persistence',
          'service restart persistence',
          'marked list jump',
          'export and import',
          'fork boundary and independent marks',
          'rewind pruning',
          'narrow marked outline without overflow',
        ],
      },
      null,
      2,
    ),
  );
});
