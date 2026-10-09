import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('centers artifact row actions without covering the relation badge', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  expect((await page.request.post(`${endpoint}/v1/permissions/perm_fixture`)).ok()).toBe(true);
  expect(
    (
      await page.request.post(
        `${endpoint}/v1/sessions/sess_flat_ndp/questions/question_fixture/answer`,
        {
          data: { selected_options: ['table'] },
        },
      )
    ).ok(),
  ).toBe(true);
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  const open = page.getByRole('button', { name: 'Open vertical-displacement.png' }).first();
  await expect(open).toBeVisible();
  const card = page.locator('.group\\/artifact').filter({ has: open });
  const more = card.getByRole('button', { name: 'More', exact: true });
  const measure = () =>
    card.evaluate((element) => {
      const header = element.firstElementChild!;
      const badge = header.querySelector('[data-slot="badge"]')!;
      const action = header.querySelector('button[aria-label="More"]')!;
      const bounds = (node: Element) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height, right: x + width, centerY: y + height / 2 };
      };
      return {
        header: bounds(header),
        badge: bounds(badge),
        action: bounds(action),
        content: bounds(header.children[1]!),
        icon: bounds(header.children[0]!),
      };
    });

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await open.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() =>
        card.evaluate((element) => {
          const scroller = element.closest<HTMLElement>('[role="log"]')!;
          const delta =
            element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
          const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
          // Match the workspace tests' framing helper: add trailing scroll room
          // for this last output so the floating composer cannot cover the row.
          // The artifact header itself keeps its production layout untouched.
          if (delta > remaining + 1) {
            const padding = Number.parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
            scroller.style.paddingBottom = `${padding + delta - remaining}px`;
          }
          scroller.scrollBy({
            behavior: 'instant',
            top: delta,
          });
          const composer = document.querySelector('[data-slot="clio-composer-stack"]')!;
          return element.getBoundingClientRect().bottom <= composer.getBoundingClientRect().top;
        }),
      )
      .toBe(true);
    await page.mouse.move(0, 0);
    // Resizing remeasures the virtualized history above this output. Wait
    // for its real scroll geometry to settle before comparing absolute
    // positions across hover and keyboard focus.
    let previousGeometry = '';
    let stableReads = 0;
    await expect
      .poll(async () => {
        const geometry = await card.evaluate((element) => {
          const scroller = element.closest<HTMLElement>('[role="log"]')!;
          return JSON.stringify([
            scroller.scrollTop,
            scroller.scrollHeight,
            scroller.clientHeight,
            element.getBoundingClientRect().y,
          ]);
        });
        stableReads = geometry === previousGeometry ? stableReads + 1 : 0;
        previousGeometry = geometry;
        return stableReads;
      })
      .toBeGreaterThanOrEqual(3);
    const resting = await measure();
    const restingBorder = await card.evaluate(
      (element) => getComputedStyle(element).borderTopColor,
    );
    await card.hover();
    await expect
      .poll(() => card.evaluate((element) => getComputedStyle(element).borderTopColor))
      .not.toBe(restingBorder);
    const hovered = await measure();
    expect(hovered).toEqual(resting);
    for (const item of [hovered.badge, hovered.action, hovered.icon, hovered.content]) {
      expect(Math.abs(item.centerY - hovered.header.centerY)).toBeLessThanOrEqual(1);
    }
    expect(hovered.action.x - hovered.badge.right).toBeGreaterThanOrEqual(8);
    expect(hovered.badge.x - hovered.content.right).toBeGreaterThanOrEqual(8);
    expect(hovered.action.right).toBeLessThanOrEqual(hovered.header.right);
    await open.focus();
    const hitArea = await open.evaluate((element) => {
      const hit = getComputedStyle(element, '::after');
      return { height: Number.parseFloat(hit.height), focus: hit.boxShadow };
    });
    expect(hitArea.height).toBeGreaterThanOrEqual(hovered.header.height - 2);
    expect(hitArea.focus).not.toBe('none');
    await page.keyboard.press('Tab');
    await expect(more).toBeFocused();
    expect(await measure()).toEqual(resting);
    await more.click();
    await expect(page.getByRole('menuitem', { name: 'Download', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  // Padding and the file icon open the artifact, not just its name.
  await card.click({ position: { x: 8, y: 8 } });
  await expect(
    page.getByRole('tab', { name: 'vertical-displacement.png', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
