import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

const evidence = process.env['CLIO_REVIEW_EVIDENCE']!;
const bootConnection = JSON.parse(readFileSync(`${evidence}/paste-live/connection.json`, 'utf8'));
const source =
  '# Preserved clipboard source\r\n  temperature: "λ🌊"\r\n' +
  'A scientific observation with its original spacing.  \r\n'.repeat(100);

test('large paste becomes a real source, previews, survives retry and is delivered once', async ({
  page,
  request,
}, testInfo) => {
  const rootPath = `${evidence}/paste-live-v2/workspace/browser-${Date.now()}`;
  mkdirSync(rootPath, { recursive: true });
  const workspaceResponse = await request.post(`${bootConnection.endpoint}/v1/workspaces`, {
    data: { name: 'Browser paste acceptance', root_path: rootPath },
  });
  expect(workspaceResponse.ok()).toBe(true);
  const workspaceId = (await workspaceResponse.json()).id;
  const sessionResponse = await request.post(`${bootConnection.endpoint}/v1/sessions`, {
    data: { title: 'Paste source delivery', workspace_id: workspaceId },
  });
  expect(sessionResponse.ok()).toBe(true);
  const sessionId = (await sessionResponse.json()).id;
  expect(
    (await request.post(`${bootConnection.endpoint}/v1/sessions/${sessionId}/cancel`)).ok(),
  ).toBe(true);
  const connection = { endpoint: bootConnection.endpoint, workspaceId, sessionId };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/tests/review/paste-source.html?${new URLSearchParams(connection)}`);
  const editor = page.getByRole('combobox', { name: /Ask .* to investigate/ });
  await editor.fill('Review the attached source.');
  const paste = async (text: string) =>
    editor.evaluate((element, value) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', value);
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      );
    }, text);
  await paste(source);
  const pill = page
    .getByRole('group', { name: 'Pending attachments' })
    .getByRole('button', { name: /^Open Pasted text/ });
  await expect(pill).toBeVisible();
  await expect(editor).toHaveText('Review the attached source.');
  const resource = async () => {
    const response = await request.get(
      `${connection.endpoint}/v1/workspaces/${connection.workspaceId}/resources`,
    );
    return (await response.json()).resources;
  };
  await expect.poll(async () => (await resource()).length).toBe(1);
  const row = (await resource())[0];
  await expect.poll(async () => (await resource())[0].state).toBe('ready');
  const bytes = await request.get(
    `${connection.endpoint}/v1/workspaces/${connection.workspaceId}/resources/${row.id}/content`,
  );
  expect(await bytes.text()).toBe(source);
  await pill.click();
  await expect(page.getByRole('dialog').locator('pre')).toHaveText(source);
  await page.screenshot({ path: testInfo.outputPath('paste-pill-preview.png') });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const sources = page.getByRole('region', { name: 'Sources', exact: true });
  await expect(
    sources.getByRole('button', { name: `Open ${row.name}`, exact: true }),
  ).toBeVisible();
  await sources.getByRole('button', { name: `Open ${row.name}`, exact: true }).click();
  await expect(sources.getByText(/Preserved clipboard source/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('paste-sources-and-composer.png') });

  // A transport refusal must leave the same file attached; retry reuses custody.
  await page.route(`**/sessions/${connection.sessionId}/queued-messages`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 503, body: 'Acceptance probe: retry the send' });
      await page.unroute(`**/sessions/${connection.sessionId}/queued-messages`);
    } else await route.continue();
  });
  const rejected = page.waitForResponse(
    (response) => response.url().endsWith('/queued-messages') && response.status() === 503,
  );
  await page.getByRole('button', { name: 'Queue message' }).click();
  await rejected;
  await expect(pill).toBeVisible();
  await expect(editor).toHaveText('Review the attached source.');
  await page.getByRole('button', { name: 'Queue message' }).click();
  await expect(pill).toHaveCount(0);
  const queuedResponse = await request.get(
    `${connection.endpoint}/v1/sessions/${connection.sessionId}/queued-messages`,
  );
  const queued = (await queuedResponse.json()).queued_messages;
  expect(queued).toHaveLength(1);
  expect(queued[0].parts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'resource_ref', resource_id: row.id }),
    ]),
  );
  expect(await resource()).toHaveLength(1);
  await expect.poll(async () => (await resource())[0].materialization.state).toBe('ready');
  const retained = (await resource())[0];
  expect(retained.pending_attachment).toBe(false);
  expect(readFileSync(retained.workspace_path, 'utf8')).toBe(source);
  expect(retained.sha256).toBe(createHash('sha256').update(source).digest('hex'));

  // Removing a second unsent paste discards its server-side source, leaving the delivered one intact.
  await paste(source + 'discard only this paste');
  await expect.poll(async () => (await resource()).length).toBe(2);
  await page.getByRole('button', { name: /^Remove Pasted text/ }).click();
  await expect.poll(async () => (await resource()).length).toBe(1);
  await page.getByRole('button', { name: 'General settings' }).click();
  await page.getByRole('spinbutton', { name: 'Paste as source after' }).fill('0');
  await page.reload();
  await page.getByRole('button', { name: 'General settings' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Paste as source after' })).toHaveValue('0');
  await page.getByRole('button', { name: 'General settings' }).click();
  await editor.click();
  await paste(source);
  await expect(editor).toHaveText(source);
  await expect(page.getByRole('group', { name: 'Pending attachments' })).toHaveCount(0);
  expect(errors).toEqual([]);
  writeFileSync(
    `${evidence}/paste-live/browser-receipt.json`,
    JSON.stringify(
      {
        connection,
        resource: retained,
        sourceLength: source.length,
        exactBytes: true,
        queued,
        retryWithoutDuplication: true,
        discardedUnsentSource: true,
        persistedOffPreference: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
});

test('a failed background upload keeps the local preview and sending retries the same upload', async ({
  page,
  request,
}) => {
  const rootPath = `${evidence}/paste-live-v2/workspace/upload-retry-${Date.now()}`;
  mkdirSync(rootPath, { recursive: true });
  const workspaceResponse = await request.post(`${bootConnection.endpoint}/v1/workspaces`, {
    data: { name: 'Paste upload retry', root_path: rootPath },
  });
  const workspaceId = (await workspaceResponse.json()).id;
  const sessionResponse = await request.post(`${bootConnection.endpoint}/v1/sessions`, {
    data: { title: 'Paste upload retry', workspace_id: workspaceId },
  });
  const sessionId = (await sessionResponse.json()).id;
  await request.post(`${bootConnection.endpoint}/v1/sessions/${sessionId}/cancel`);
  const connection = { endpoint: bootConnection.endpoint, workspaceId, sessionId };
  let initialUploadId: string | undefined;
  await page.route(`**/workspaces/${workspaceId}/resources`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    initialUploadId = route.request().postDataJSON().client_upload_id;
    await route.fulfill({ status: 503, body: 'Acceptance probe: upload unavailable' });
    await page.unroute(`**/workspaces/${workspaceId}/resources`);
  });
  await page.goto(`/tests/review/paste-source.html?${new URLSearchParams(connection)}`);
  const editor = page.getByRole('combobox', { name: /Ask .* to investigate/ });
  const refused = page.waitForResponse(
    (response) => response.url().endsWith('/resources') && response.status() === 503,
  );
  await editor.evaluate((element, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    );
  }, source);
  await refused;
  await page.getByRole('button', { name: /^Open Pasted text/ }).click();
  await expect(page.getByRole('dialog').locator('pre')).toHaveText(source);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Queue message' }).click();
  await expect(page.getByRole('group', { name: 'Pending attachments' })).toHaveCount(0);
  const resources = (
    await (
      await request.get(`${connection.endpoint}/v1/workspaces/${workspaceId}/resources`)
    ).json()
  ).resources;
  expect(resources).toHaveLength(1);
  expect(resources[0].client_upload_id).toBe(initialUploadId);
  const content = await request.get(
    `${connection.endpoint}/v1/workspaces/${workspaceId}/resources/${resources[0].id}/content`,
  );
  expect(await content.text()).toBe(source);
  const queued = (
    await (
      await request.get(`${connection.endpoint}/v1/sessions/${sessionId}/queued-messages`)
    ).json()
  ).queued_messages;
  expect(queued).toHaveLength(1);
  expect(queued[0].parts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'resource_ref', resource_id: resources[0].id }),
    ]),
  );
  writeFileSync(
    `${evidence}/paste-live/upload-retry-receipt.json`,
    JSON.stringify(
      {
        connection,
        resource: resources[0],
        initialUploadId,
        exactBytes: true,
        previewDuringFailure: true,
        queued,
      },
      null,
      2,
    ),
  );
});
