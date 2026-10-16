import { expect, test } from '@playwright/test';

test('full-viewport authored layout with default margins does not ratchet its height', async ({
  page,
}) => {
  await page.goto('/tests/review/html-responsive.html?viewport-case');
  await page.locator('#full-viewport iframe').scrollIntoViewIfNeeded();
  const frame = page.frameLocator('#full-viewport iframe');
  await expect(
    frame.getByText('Full viewport with default margins', { exact: true }),
  ).toBeVisible();
  await frame.locator('body').evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        const next = () => {
          if (++frames === 20) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
  );
  expect(
    await page.locator('#full-viewport iframe').evaluate((element) => element.clientHeight),
  ).toBe(318);
  const bodyFrame = page.frameLocator('#body-viewport iframe');
  await page.locator('#body-viewport iframe').scrollIntoViewIfNeeded();
  await expect(bodyFrame.getByText('Body viewport height', { exact: true })).toBeVisible();
  await bodyFrame.locator('body').evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        const next = () => {
          if (++frames === 20) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
  );
  expect(
    await page.locator('#body-viewport iframe').evaluate((element) => element.clientHeight),
  ).toBe(336);
  await page.locator('#natural-viewport iframe').scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.locator('#natural-viewport iframe').evaluate((element) => element.clientHeight),
    )
    .toBe(166);
});

for (const desktop of [false, true]) {
  test(`HTML fits growing and shrinking content; theme updates preserve state${desktop ? ' under Desktop CSP' : ''}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/tests/review/html-responsive.html${desktop ? '?desktop-policy' : ''}`);
    const iframe = page.locator('#interactive iframe');
    const frame = page.frameLocator('#interactive iframe');
    await expect(frame.locator('#count')).toHaveText('Observations: 0');
    await expect
      .poll(() => iframe.evaluate((element) => element.clientHeight))
      .toBeGreaterThan(100);
    const initial = await iframe.evaluate((element) => element.clientHeight);
    const identity = await frame
      .locator('body')
      .evaluate(() => (window as unknown as { renderIdentity: string }).renderIdentity);
    await frame.locator('#count').click();
    await frame.getByLabel('Location').fill('Atlantic coast');
    await frame.locator('#expand').click();
    await expect
      .poll(() => iframe.evaluate((element) => element.clientHeight))
      .toBeGreaterThan(initial + 400);
    await frame.locator('#expand').click();
    await expect.poll(() => iframe.evaluate((element) => element.clientHeight)).toBe(initial);
    const light = await frame
      .locator('body')
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await expect
      .poll(() =>
        frame.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .not.toBe(light);
    await expect(frame.locator('#count')).toHaveText('Observations: 1');
    await expect(frame.getByLabel('Location')).toHaveValue('Atlantic coast');
    expect(
      await frame
        .locator('body')
        .evaluate(() => (window as unknown as { renderIdentity: string }).renderIdentity),
    ).toBe(identity);
    const clipping = await frame
      .locator('body')
      .evaluate((element) => element.getBoundingClientRect().bottom > innerHeight);
    expect(clipping).toBe(false);
    await page.screenshot({
      path: test.info().outputPath(`html-theme-dark${desktop ? '-desktop' : ''}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Toggle width', exact: true }).click();
    await expect.poll(() => iframe.evaluate((element) => element.clientWidth)).toBeLessThan(340);
    const fittedHeight = await frame.locator('body').evaluate((element) => {
      const css = getComputedStyle(element);
      return Math.ceil(
        element.getBoundingClientRect().height +
          parseFloat(css.marginTop) +
          parseFloat(css.marginBottom),
      );
    });
    await expect.poll(() => iframe.evaluate((element) => element.clientHeight)).toBe(fittedHeight);
    const svg = frame.locator('svg');
    expect(
      await svg.evaluate((element) => element.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(340);
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await expect
      .poll(() =>
        frame.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe(light);
    await expect(frame.locator('#count')).toHaveText('Observations: 1');
    expect(errors).toEqual([]);
  });
}

test('static updates grow without internal scrolling; SVG themes and zoom survive theme changes', async ({
  page,
}) => {
  await page.goto('/tests/review/html-responsive.html');
  const staticFrame = page.locator('#static iframe');
  const content = page.frameLocator('#static iframe');
  await expect(content.getByText('Observation 1:', { exact: false })).toBeVisible();
  const original = await staticFrame.evaluate((element) => element.clientHeight);
  for (let i = 0; i < 6; i++)
    await page.getByRole('button', { name: 'Append content', exact: true }).click();
  await expect(content.locator('p')).toHaveCount(7);
  await expect
    .poll(() => staticFrame.evaluate((element) => element.clientHeight))
    .toBeGreaterThan(original + 100);
  expect(
    await content
      .locator('body')
      .evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight),
  ).toBe(true);
  const image = page.locator('#svg img');
  await expect(image).toBeVisible();
  const light = await image.getAttribute('src');
  await page.locator('#svg').getByRole('button', { name: 'Zoom in', exact: true }).click();
  const width = await image.evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(image).not.toHaveAttribute('src', light!);
  expect(await image.evaluate((element) => element.getBoundingClientRect().width)).toBe(width);
  const svgContent = await image.evaluate(async (element) =>
    fetch((element as HTMLImageElement).src).then((response) => response.text()),
  );
  expect(svgContent).toContain('--foreground: oklch(0.95 0 0)');
  expect(svgContent).toContain('fill="currentColor"');
  await page.screenshot({
    path: test.info().outputPath('html-svg-theme-dark.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Reopen previews', exact: true }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reopen previews', exact: true }).click();
  await expect(content.locator('p')).toHaveCount(7);
  await expect
    .poll(() =>
      content.locator('html').evaluate((element) => getComputedStyle(element).colorScheme),
    )
    .toBe('dark');
});

test('inline SVG adapts in place, retains fullscreen and downloads its original bytes', async ({
  page,
}) => {
  await page.goto('/tests/review/html-responsive.html');
  const image = page.locator('#inline-svg img');
  await expect(image).toBeVisible();
  const lightUrl = await image.getAttribute('src');
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(image).not.toHaveAttribute('src', lightUrl!);
  await page.getByRole('button', { name: 'Enlarge waves.svg', exact: true }).click();
  const fullscreen = page.getByRole('dialog');
  await expect(fullscreen.getByRole('img', { name: 'Inline wave diagram' })).toBeVisible();
  const darkUrl = await fullscreen.locator('img').getAttribute('src');
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await expect(fullscreen.locator('img')).not.toHaveAttribute('src', darkUrl!);
  await expect(fullscreen).toBeVisible();
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).click();
  await image.hover();
  await page.locator('#inline-svg').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /Download/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Original image', exact: true }).click();
  const file = await download;
  await file.saveAs(test.info().outputPath('original-waves.svg'));
  const { readFile } = await import('node:fs/promises');
  const original = await readFile(test.info().outputPath('original-waves.svg'), 'utf8');
  expect(original).toContain('fill="var(--background)"');
  expect(original).not.toContain('<style');
  await page.screenshot({
    path: test.info().outputPath('inline-svg-theme-light.png'),
    fullPage: true,
  });
});
