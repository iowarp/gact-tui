import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`keeps live activity rows visible and preserves reader choices at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/review/live-activity.html');
    // The row's chevron is its disclosure at every width; phones hide the action name.
    const disclosure = (action: string) =>
      page.getByRole('button', { name: new RegExp(`^(?:Expand|Collapse) ${action}$`, 'u') });
    const read = disclosure('Read file');
    const run = disclosure('Run command');
    const write = disclosure('Write file');
    const readResult = page.getByRole('region', { name: 'Read file: Result' });
    const live = page.locator('[data-slot="transcript-activity-timeline"][aria-busy="true"]');
    // Live rows read as they arrive; nothing opens on its own.
    await expect(read).toBeVisible();
    await expect(run).toBeVisible();
    await expect(read).toHaveAttribute('aria-expanded', 'false');
    await expect(live).toHaveCount(1);
    await page.getByRole('button', { name: 'Show next activity group', exact: true }).click();
    // Earlier rows never fold away when the next step starts; the running row has nothing to open yet.
    const writeRow = page.locator('[data-slot="activity-row"]').filter({ hasText: 'findings.md' });
    await expect(writeRow).toBeVisible();
    await expect(writeRow.getByRole('img', { name: 'Running' })).toBeVisible();
    await expect(write).toHaveCount(0);
    await expect(read).toBeVisible();
    await expect(run).toBeVisible();
    // A reader's choice survives the live turn updating and finishing.
    await read.click();
    await expect(read).toHaveAttribute('aria-expanded', 'true');
    await expect(readResult).toBeVisible();
    await expect(readResult).toContainText('08:15');
    await page.getByRole('button', { name: 'Finish fixture', exact: true }).click();
    await expect(
      page.getByText('The report is saved. Review the source observations before interpreting'),
    ).toBeVisible();
    await expect(live).toHaveCount(0);
    await expect(read).toHaveAttribute('aria-expanded', 'true');
    await expect(readResult).toBeVisible();
    await expect(write).toHaveAttribute('aria-expanded', 'false');
    await write.click();
    await expect(write).toHaveAttribute('aria-expanded', 'true');
    await read.click();
    await expect(read).toHaveAttribute('aria-expanded', 'false');
    await expect(readResult).toHaveCount(0);
    await expect(write).toHaveAttribute('aria-expanded', 'true');
    await expect(run).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath(`live-choices-${width}.png`) });
  });
}
