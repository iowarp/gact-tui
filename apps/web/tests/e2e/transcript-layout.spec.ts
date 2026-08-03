/**
 * Layout invariants that only a real browser can observe.
 *
 * jsdom does not load CSS, so `getComputedStyle` there reports nothing about
 * layout. Asserting a visual guarantee with a predicate that cannot see it is
 * worse than not asserting it — these run in Chromium, against real styles.
 */
import { expect, test } from '@playwright/test';

test('the user turn is a right-aligned bubble, not a full-width card', async ({ page }) => {
  await page.goto('/?shell');

  const bubble = page.locator('.transcript__message[data-role="user"]').first();
  await expect(bubble).toBeVisible();

  const layout = await bubble.evaluate((el) => {
    const style = getComputedStyle(el);
    const parentWidth = (el.parentElement as HTMLElement).clientWidth;
    return {
      alignSelf: style.alignSelf,
      borderRadius: style.borderRadius,
      widthRatio: el.getBoundingClientRect().width / parentWidth,
    };
  });

  expect(layout.alignSelf).toBe('flex-end');
  // The prototype's asymmetric corner: 12px 12px 4px 12px.
  expect(layout.borderRadius).toContain('4px');
  expect(layout.widthRatio).toBeLessThanOrEqual(0.79);
});

test('assistant output stays full width', async ({ page }) => {
  await page.goto('/?shell');
  const assistant = page.locator('.transcript__message[data-role="assistant"]').first();
  const alignSelf = await assistant.evaluate((el) => getComputedStyle(el).alignSelf);
  expect(alignSelf).not.toBe('flex-end');
});

test('an unrenderable part is visible, not dropped', async ({ page }) => {
  await page.goto('/?shell');
  const unknown = page.getByTestId('part-unrenderable');
  await expect(unknown).toBeVisible();
  await expect(unknown).toContainText('some_future_kind');
});

test('the composer pill sits at the bottom of the viewport, not the bottom of the text', async ({
  page,
}) => {
  // The defect this pins (C3): the content column scrolled as one block, so
  // the composer flowed after the transcript and came to rest mid-screen on a
  // short session. The transcript must absorb the free space instead.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?shell');

  const composer = page.locator('.composer');
  await expect(composer).toBeVisible();

  const box = await composer.boundingBox();
  expect(box).not.toBeNull();
  // Within the 18px bottom gutter of the viewport floor.
  expect(900 - (box!.y + box!.height)).toBeLessThanOrEqual(2);

  // The transcript, not the column, owns scrolling.
  const scroll = await page
    .locator('.transcript')
    .evaluate((el) => ({ overflowY: getComputedStyle(el).overflowY, flexGrow: getComputedStyle(el).flexGrow }));
  expect(scroll.overflowY).toBe('auto');
  expect(scroll.flexGrow).toBe('1');

  const column = await page
    .locator('.shell__content')
    .evaluate((el) => getComputedStyle(el).overflowY);
  expect(column).toBe('hidden');
});

test('the composer stays pinned when the transcript is too short to fill the column', async ({
  page,
}) => {
  // A short transcript is the case that exposed the bug; a tall one hid it.
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/?shell');
  const box = await page.locator('.composer').boundingBox();
  expect(1200 - (box!.y + box!.height)).toBeLessThanOrEqual(2);
});
