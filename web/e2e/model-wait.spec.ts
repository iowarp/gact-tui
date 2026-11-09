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
    // The spec's narrow rule: the model shrinks to its name, then its logo.
    // Hover and the accessible description keep the full selection either way.
    const shown = width >= 1280 ? [provider, model] : [];
    for (const name of shown) {
      await expect(name).toBeVisible();
      await expect(name).toHaveCSS('text-overflow', 'ellipsis');
      expect((await name.boundingBox())!.width).toBeGreaterThan(30);
    }
    if (!shown.length) await expect(provider).toBeHidden();
    // The provider takes only its own width, never padding after a short name.
    if (shown.length)
      expect(
        await provider.evaluate(
          (node) => node.getBoundingClientRect().width <= node.scrollWidth + 1,
        ),
      ).toBe(true);
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
    // A silent wait reads as live thinking with its elapsed time.
    await expect(waiting).toContainText('Thinking…');
    await expect(waiting).toContainText(/\d+s/);
    await page.screenshot({ path: test.info().outputPath(`model-wait-${width}.png`) });
    await page.getByRole('button', { name: 'reasoning', exact: true }).click();
    await expect(waiting).toHaveCount(0);
    const reasoning = page.locator('[data-slot="transcript-reasoning"]');
    await expect(reasoning).toBeVisible();
    await expect(reasoning).toHaveAttribute('aria-busy', 'true');
    await expect(reasoning.locator('[data-slot="reasoning-summary"]')).toHaveText('Thinking…');
    const thinking = page.getByRole('button', {
      name: 'Thinking: Comparing the notes',
      exact: true,
    });
    // A streaming passage with more to read is open until it settles or the reader folds it.
    await expect(thinking).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Simulated reasoning sample for this UI fixture.')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`model-reasoning-${width}.png`) });
    await thinking.click();
    await expect(thinking).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Simulated reasoning sample for this UI fixture.')).toHaveCount(0);
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
