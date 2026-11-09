import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Requires the REAL service and state from scripts/live_verification/conversation_controls.py.
 * No routes are intercepted, no transcript is injected, and no model response is substituted.
 * CLIO_CONVERSATION_STATE=<acceptance-state.json> CLIO_CONVERSATION_CAPTURE_DIR=<directory>
 */
const endpoint = process.env['CLIO_ENDPOINT'] ?? 'http://127.0.0.1:17961';
const statePath = process.env['CLIO_CONVERSATION_STATE'];
const captureDir = process.env['CLIO_CONVERSATION_CAPTURE_DIR'];

interface Message {
  id: string;
  role: string;
  parts: { type: string; text?: string }[];
}

test('real conversation branch, cancel rewind, confirm rewind and reload', async ({ page }) => {
  test.setTimeout(240_000);
  expect(statePath, 'Set CLIO_CONVERSATION_STATE to the real acceptance state').toBeTruthy();
  expect(captureDir, 'Set CLIO_CONVERSATION_CAPTURE_DIR to retain captures').toBeTruthy();
  const state = JSON.parse(await readFile(statePath!, 'utf8')) as {
    workspace: string;
    baseline_message: string;
    sessions: Record<string, string>;
  };
  await mkdir(captureDir!, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  const api = async (method: string, url: string, data?: unknown) => {
    const response = await page.request.fetch(endpoint + url, { method, data });
    expect(response.ok(), `${method} ${url}: ${response.status()}`).toBe(true);
    return response.json();
  };
  const messages = async (sid: string): Promise<Message[]> =>
    (await api('GET', `/v1/sessions/${sid}/messages`)).messages;
  const answerText = (rows: Message[]) =>
    rows
      .filter((row) => row.role === 'assistant')
      .flatMap((row) =>
        row.parts.filter((part) => part.type === 'text').map((part) => part.text ?? ''),
      );
  const capture = async (name: string) => {
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    await mkdir(path.join(captureDir!, 'originals'), { recursive: true });
    await page.screenshot({ path: path.join(captureDir!, 'originals', name) });
    const dialog = page.getByRole('alertdialog');
    const bounds = name.includes('confirm') ? await dialog.boundingBox() : null;
    const clip = bounds
      ? { x: bounds.x - 24, y: 0, width: bounds.width + 48, height: bounds.y + bounds.height + 24 }
      : {
          x: 248,
          y: 0,
          width: 1032,
          height: name.includes('menu') ? 420 : name.includes('branch-result') ? 780 : 620,
        };
    await page.screenshot({ path: path.join(captureDir!, name), clip });
  };
  const turn = async (prompt: string, mean: number) => {
    const composer = page.getByRole('combobox', { name: /^Ask .+ to investigate/ });
    await composer.fill(
      prompt + ' Answer in two short sentences without tools. End with "Mean: <value>."',
    );
    await composer.press('Enter');
    await expect(
      page
        .getByRole('log', { name: 'Conversation' })
        .getByText(new RegExp(`Mean: ${mean}\\.`))
        .last(),
    ).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  };
  const parent = await api('POST', `/v1/sessions/${state.sessions['baseline']}/fork`, {
    title: 'Compare calibration methods',
    at_message_id: state.baseline_message,
  });
  await page.goto(`/workspaces/${state.workspace}/sessions/${parent.id}`);
  await expect(page.getByRole('combobox', { name: /^Ask .+ to investigate/ })).toBeVisible();
  await turn(
    'Exclude reading 14 as a hypothetical flagged measurement; remember this as our current method.',
    11,
  );
  const before = await messages(parent.id);
  await page
    .getByRole('button', { name: 'Actions for Compare calibration methods', exact: true })
    .click();
  await expect(page.getByRole('menuitem', { name: 'Fork' })).toBeVisible();
  await capture('docs-conversation-menu.png');
  const tailResponse = page.waitForResponse(
    (response) => response.url().endsWith('/fork') && response.request().method() === 'POST',
  );
  await page.getByRole('menuitem', { name: 'Fork' }).click();
  const tail = await (await tailResponse).json();
  await expect(page).toHaveURL(new RegExp(`/sessions/${tail.id}$`));
  await expect(
    page
      .locator(`[data-session-id="${tail.id}"][data-message-id="${state.baseline_message}"]`)
      .first(),
  ).toBeVisible();
  expect((await messages(tail.id)).map((row) => row.id)).toEqual(before.map((row) => row.id));
  await page.getByRole('button', { name: /Return to parent conversation/ }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${parent.id}$`));
  await page
    .getByRole('log', { name: 'Conversation' })
    .evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }));
  const baselineRow = page.locator(`[data-message-id="${state.baseline_message}"]`).first();
  await expect(baselineRow).toBeVisible({ timeout: 10_000 });
  await baselineRow.scrollIntoViewIfNeeded();
  await baselineRow
    .getByRole('button', { name: 'Fork into a new conversation', exact: true })
    .hover();
  await expect(
    page.getByRole('tooltip').getByText('Fork into a new conversation', { exact: true }),
  ).toBeVisible();
  await capture('docs-conversation-branch-control.png');
  const forked = page.waitForResponse(
    (response) => response.url().endsWith('/fork') && response.request().method() === 'POST',
  );
  await baselineRow
    .getByRole('button', { name: 'Fork into a new conversation', exact: true })
    .click();
  const branch = await (await forked).json();
  await expect(page).toHaveURL(new RegExp(`/sessions/${branch.id}$`));
  await expect(page.getByText('Loading messages…', { exact: true })).toHaveCount(0);
  await expect(
    page
      .locator(`[data-session-id="${branch.id}"][data-message-id="${state.baseline_message}"]`)
      .first(),
  ).toBeVisible();
  expect((await messages(branch.id)).map((row) => row.id)).toEqual(
    before.slice(-2).map((row) => row.id),
  );
  await turn(
    'Keep all original readings and add an offset of +2 to each; remember this as our current method.',
    14,
  );
  expect(await messages(parent.id)).toEqual(before);
  await expect(page.getByRole('button', { name: /Return to parent conversation/ })).toBeVisible();
  await capture('docs-conversation-branch-result.png');
  await page.reload();
  await expect(
    page
      .getByRole('log', { name: 'Conversation' })
      .getByText(/Mean: 14\./)
      .last(),
  ).toBeVisible();
  await page.getByRole('button', { name: /Return to parent conversation/ }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${parent.id}$`));
  await page
    .getByRole('log', { name: 'Conversation' })
    .evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }));
  await baselineRow.scrollIntoViewIfNeeded();
  await baselineRow.getByRole('button', { name: 'Rewind to here' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Rewind this conversation?' });
  await expect(dialog).toContainText('Files and artifacts already created or edited are kept.');
  await capture('docs-conversation-rewind-confirm.png');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await messages(parent.id)).toEqual(before);
  await baselineRow.getByRole('button', { name: 'Rewind to here' }).click();
  const rewound = page.waitForResponse((response) => response.url().endsWith('/rewind'));
  await dialog.getByRole('button', { name: 'Remove later messages' }).click();
  expect((await rewound).ok()).toBe(true);
  await expect(dialog).toHaveCount(0);
  expect((await messages(parent.id)).length).toBe(2);
  await turn('Recall our current calibration method and mean.', 12);
  await capture('docs-conversation-rewind-result.png');
  await page.reload();
  await expect(
    page
      .getByRole('log', { name: 'Conversation' })
      .getByText(/Mean: 12\./)
      .last(),
  ).toBeVisible();
  expect(answerText(await messages(branch.id)).at(0)).toContain('Mean: 14.');
  await writeFile(
    path.join(captureDir!, 'browser-verdict.json'),
    JSON.stringify(
      {
        passed: true,
        parent: parent.id,
        branch: branch.id,
        endpoint,
        cases: [
          'header branch copies the full tail',
          'message boundary',
          'independent follow-up',
          'return to parent',
          'reload branch',
          'cancel rewind',
          'confirm rewind',
          'continued context',
          'reload rewind',
          'branch survives parent rewind',
        ],
      },
      null,
      2,
    ),
  );
});
