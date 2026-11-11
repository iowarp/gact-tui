import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`renders saved and streaming standard math at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/tests/review/standard-math.html');
    const saved = page.getByRole('region', { name: 'Saved response', exact: true });
    await expect(saved.locator('.katex')).toHaveCount(8);
    await expect(saved.locator('.katex-display')).toHaveCount(2);
    await expect(saved.locator('.katex-error')).toHaveCount(0);
    const streaming = page.getByRole('region', { name: 'Streaming response', exact: true });
    await expect(streaming.locator('.katex')).toHaveCount(0);
    await page.getByRole('button', { name: 'Complete streaming fixture', exact: true }).click();
    await expect(streaming.locator('.katex')).toHaveCount(1);
    await page.reload();
    await expect(saved.locator('.katex')).toHaveCount(8);
    const literal = page.getByRole('region', { name: 'Literal examples', exact: true });
    await expect(literal).toContainText('Cost: $20 and $30');
    await expect(literal.locator('code').first()).toHaveText('x^2');
    await expect(literal.locator('p code')).toHaveCount(1);
    await expect(literal.locator('pre code')).toHaveText(String.raw`\[x^2\]`);
    await expect(literal.locator('.katex')).toHaveCount(3);
    await expect(
      page.getByRole('region', { name: 'Multiline equation' }).locator('.katex-display'),
    ).toHaveCount(1);
    await expect(
      page.getByRole('region', { name: 'Display in prose' }).locator('.katex-display'),
    ).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    // Typeface and glyph layout are visual properties: the baseline guards them.
    await page.evaluate(() => document.fonts.ready);
    await expect(saved).toHaveScreenshot(`standard-math-saved-${width}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });
}
