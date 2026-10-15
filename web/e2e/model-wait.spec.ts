import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`reserves provider and model space with full hover and focus names at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/review/model-wait.html');
    const pill = page.getByRole('button', { name: 'Change model', exact: true });
    const fullName = 'AmSC Model Access Gateway / inkling-small-xhigh@cborg';
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAccessibleDescription(fullName);
    const provider = pill.locator('[data-slot="model-choice-provider"]');
    const model = pill.locator('[data-slot="model-choice-model"]');
    for (const name of [provider, model]) {
      await expect(name).toBeVisible();
      await expect(name).toHaveCSS('text-overflow', 'ellipsis');
      expect((await name.boundingBox())!.width).toBeGreaterThan(30);
    }
    expect(
      Math.abs((await provider.boundingBox())!.width - (await model.boundingBox())!.width),
    ).toBeLessThan(1);
    await pill.hover();
    await expect(page.getByRole('tooltip')).toHaveText(fullName);
    await page.screenshot({ path: test.info().outputPath(`model-label-hover-${width}.png`) });
    // Radix keeps a grace corridor from the trigger to its hoverable tooltip;
    // move through it instead of teleporting to the final pointer coordinate.
    await page.mouse.move(0, 0, { steps: 3 });
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await pill.focus();
    await expect(page.getByRole('tooltip')).toHaveText(fullName);
    await pill.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Choose a model' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test(`keeps silent response waits visible and yields to real activity at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/review/model-wait.html');
    const waiting = page.locator('[data-slot="turn-response-wait"]');
    await expect(waiting).toBeVisible();
    await expect(waiting).toContainText('Waiting for response');
    await expect(waiting).toContainText(/\d+s/);
    await page.screenshot({ path: test.info().outputPath(`model-wait-${width}.png`) });
    await page.getByRole('button', { name: 'reasoning', exact: true }).click();
    await expect(waiting).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Activity: Thinking', exact: true }),
    ).toBeVisible();
    const thinking = page.getByRole('button', {
      name: 'Thinking: Comparing the notes',
      exact: true,
    });
    await expect(thinking).toBeVisible();
    await thinking.click();
    await expect(page.getByText('Simulated reasoning sample for this UI fixture.')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`model-reasoning-${width}.png`) });
    await page.getByRole('button', { name: 'tool', exact: true }).click();
    await expect(waiting).toHaveCount(0);
    await page.getByRole('button', { name: 'wait', exact: true }).click();
    await expect(waiting).toBeVisible();
    await page.getByRole('button', { name: 'complete', exact: true }).click();
    await expect(waiting).toHaveCount(0);
    await expect(
      page.getByText('The notes are summarized. Review the source before acting.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'paused', exact: true }).click();
    await expect(waiting).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
