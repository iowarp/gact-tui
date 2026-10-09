import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const session = 'sess_flat_ndp';
const workspace = 'ws_flat_ndp';

test('shows one latest response output while Evidence retains versions and review files', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.request.post(`${endpoint}/__test/reset`);
  await page.request.post(`${endpoint}/v1/permissions/perm_fixture`);
  await page.request.post(`${endpoint}/v1/sessions/${session}/questions/question_fixture/answer`, {
    data: { selected_options: ['table'] },
  });
  const rows = [
    {
      id: 'garden_v1',
      name: 'sunflower-garden.html',
      version: 1,
      purpose: 'deliverable',
      media_type: 'text/html',
    },
    {
      id: 'garden_v2',
      name: 'sunflower-garden.html',
      version: 2,
      purpose: 'deliverable',
      media_type: 'text/html',
    },
    {
      id: 'review_png',
      name: 'review.png',
      version: 1,
      purpose: 'verification',
      media_type: 'image/png',
    },
    {
      id: 'working_pdf',
      name: 'working.pdf',
      version: 1,
      purpose: 'intermediate',
      media_type: 'application/pdf',
    },
    {
      id: 'requested_pdf',
      name: 'requested.pdf',
      version: 1,
      purpose: 'deliverable',
      media_type: 'application/pdf',
    },
    {
      id: 'requested_png',
      name: 'requested.png',
      version: 1,
      purpose: 'deliverable',
      media_type: 'image/png',
    },
  ];
  const artifacts = rows.map((row) => ({
    ...row,
    session_id: session,
    workspace_id: workspace,
    uri: `artifact://${workspace}/${row.name}@v${row.version}`,
    size: 512,
    session_relation: 'produced',
    producer: {
      session_id: session,
      turn_id: 'garden-turn',
      agent_id: 'main',
      purpose: row.purpose,
    },
  }));
  await page.route(`${endpoint}/v1/sessions/${session}/messages*`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.artifacts = artifacts;
    body.messages = [
      {
        id: 'garden-request',
        session_id: session,
        role: 'user',
        created_at: '2026-08-22T19:59:58.000Z',
        blocks: [
          {
            id: 'request-text',
            type: 'text',
            text: 'Create a sunflower garden with the requested PDF and image.',
          },
        ],
      },
      {
        id: 'garden-answer',
        session_id: session,
        role: 'assistant',
        created_at: '2026-08-22T19:59:59.000Z',
        completed_at: '2026-08-22T20:00:00.000Z',
        blocks: [
          {
            id: 'answer-text',
            type: 'text',
            text: 'The corrected garden and requested exports are ready.',
          },
          // Old persisted answers may contain both immutable version links.
          ...['garden_v1', 'garden_v2', 'requested_pdf', 'requested_png'].map((id) => ({
            id: `block-${id}`,
            type: 'artifact',
            artifact_id: id,
          })),
        ],
      },
    ];
    await route.fulfill({ response, json: body });
  });
  await page.route(`${endpoint}/v1/sessions/${session}/artifacts*`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const base = body.artifacts[0];
    body.artifacts = rows
      .filter((row) => row.id !== 'garden_v1')
      .map((row) => ({
        ...base,
        name: row.name,
        head_artifact_id: row.id,
        latest_version: row.version,
        versions: artifacts
          .filter((artifact) => artifact.name === row.name)
          .map((artifact) => ({
            ...base.versions[0],
            ...artifact,
            artifact_id: artifact.id,
            kind: artifact.media_type === 'image/png' ? 'image' : 'report',
            size_bytes: artifact.size,
            fetch_url: `/v1/artifacts/${artifact.id}/bytes`,
          })),
      }));
    body.count = body.artifacts.length;
    await route.fulfill({ response, json: body });
  });
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  await page.goto(`/workspaces/${workspace}/sessions/${session}`);
  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(
    conversation.getByRole('button', { name: 'Open sunflower-garden.html', exact: true }),
  ).toHaveCount(1);
  await expect(conversation.getByText('HTML · 512 B · v2', { exact: true })).toBeVisible();
  await expect(conversation.getByRole('button', { name: 'Open review.png' })).toHaveCount(0);
  await expect(conversation.getByRole('button', { name: 'Open working.pdf' })).toHaveCount(0);
  for (const name of ['requested.pdf', 'requested.png'])
    await expect(conversation.getByRole('button', { name: `Open ${name}` })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('latest-response.png') });
  await page.getByRole('button', { name: /^Evidence layout:/ }).click();
  await page.getByRole('button', { name: 'Open full details' }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  await canvas.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await canvas.getByRole('button', { name: /^Artifacts/ }).click();
  await expect(
    canvas.getByRole('button', { name: 'Open sunflower-garden.html', exact: true }),
  ).toHaveCount(2);
  await expect(canvas.getByText('HTML · 512 B · v1', { exact: true })).toBeVisible();
  await expect(canvas.getByText('HTML · 512 B · v2', { exact: true })).toBeVisible();
  await expect(canvas.getByText('Verification', { exact: true })).toBeVisible();
  await expect(canvas.getByText('Intermediate', { exact: true })).toBeVisible();
  await expect(canvas.getByRole('button', { name: 'Open review.png' })).toBeVisible();
  await expect(canvas.getByRole('button', { name: 'Open working.pdf' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('retained-evidence.png') });
  expect(errors).toEqual([]);
});
