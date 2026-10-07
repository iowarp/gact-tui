import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('an image opens on a fitted stage, resists dragging, and returns its reference to the composer', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.request.post(`${endpoint}/__test/reset`);
  expect((await page.request.post(`${endpoint}/__test/attachments-demo`)).ok()).toBe(true);
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/v1/sessions/sess_flat_ndp/messages', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const surfaceId = 'image_preview';
    const catalogId = 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1';
    body.surfaces = [
      {
        id: surfaceId,
        session_id: 'sess_flat_ndp',
        catalog_id: catalogId,
        protocol_version: '0.9.1',
        revision: 1,
        state: 'ready',
        messages: [
          { version: 'v0.9.1', createSurface: { surfaceId, catalogId } },
          {
            version: 'v0.9.1',
            updateComponents: {
              surfaceId,
              components: [
                {
                  id: 'root',
                  component: 'Image',
                  url: 'artifact://artifact_plot',
                  description: 'Review figure',
                  fit: 'contain',
                  variant: 'largeFeature',
                },
              ],
            },
          },
        ],
      },
    ];
    await route.fulfill({ json: body });
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  const conversation = page.getByRole('log', { name: 'Conversation' });
  const image = page.getByRole('img', { name: 'Review figure', exact: true });
  await expect
    .poll(async () => {
      await conversation.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      return image.isVisible();
    })
    .toBe(true);
  const dialog = page.getByRole('dialog', { name: 'vertical-displacement.png', exact: true });
  for (const [label, width, height] of [
    ['desktop', 1280, 720],
    ['phone', 390, 640],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(async () => {
        await conversation.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
        return image.isVisible();
      })
      .toBe(true);
    await page
      .getByRole('button', { name: 'Enlarge vertical-displacement.png', exact: true })
      .click();
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).toEqual({ x: 0, y: 0, width, height });
    await expect(image).toHaveAttribute('draggable', 'false');
    await expect(image).toHaveCSS('object-fit', 'contain');
    const stage = dialog.locator('[data-slot="surface-dialog-host-scroller"]');
    const stageBounds = (await stage.boundingBox())!;
    const imageBounds = (await image.boundingBox())!;
    expect(imageBounds.height).toBeGreaterThan(height * 0.7);
    expect(imageBounds.x).toBeGreaterThanOrEqual(stageBounds.x);
    expect(imageBounds.y + imageBounds.height).toBeLessThanOrEqual(
      stageBounds.y + stageBounds.height,
    );
    await page.mouse.move(
      imageBounds.x + imageBounds.width / 2,
      imageBounds.y + imageBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      imageBounds.x + imageBounds.width / 2 + 50,
      imageBounds.y + imageBounds.height / 2 + 30,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(page.getByRole('dialog', { name: 'Add attachments', exact: true })).toHaveCount(0);
    expect(await image.boundingBox()).toEqual(imageBounds);
    await expect(
      dialog.getByRole('button', { name: 'Exit full screen', exact: true }),
    ).toBeVisible();
    await dialog.hover();
    await expect(dialog.getByRole('button', { name: 'Reference this', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`image-preview-${label}.png`) });
    if (label === 'desktop') {
      await dialog.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Download', exact: true }).hover();
      const download = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: 'Original image', exact: true }).click();
      expect((await download).suggestedFilename()).toBe('vertical-displacement.png');
      await dialog.getByRole('button', { name: 'Exit full screen', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
  }
  await dialog.getByRole('button', { name: 'Reference this', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const selections = page.getByRole('list', { name: 'Attached selections' });
  await expect(selections).toContainText('the whole image');
  await expect(selections.getByRole('listitem')).toHaveCount(1);
  await expect(
    page.getByRole('combobox', { name: /Ask .* to investigate, build, explain, or act/ }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});
