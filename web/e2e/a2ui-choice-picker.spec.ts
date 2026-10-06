import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/widget-preview.html#choice-picker');
  await page.getByRole('tab', { name: 'Components', exact: true }).click();
});

test('large exclusive choices are searchable and usable from the keyboard', async ({ page }) => {
  await page.getByRole('button', { name: 'One plant', exact: true }).click();
  const picker = page.getByRole('combobox', { name: 'Plant ID', exact: true });
  await expect(picker).toHaveText('Plant 1');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await picker.press('Enter');
  const search = page.getByRole('combobox', { name: 'Search Plant ID', exact: true });
  await expect(search).toBeFocused();
  await search.fill('Plant 149');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(picker).toHaveText('Plant 149');
  await expect(picker).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('multi-select retains choices across filtering and reopening', async ({ page }) => {
  await page.getByRole('button', { name: 'Several plants', exact: true }).click();
  const picker = page.getByRole('combobox', { name: 'Plant ID', exact: true });
  await picker.click();
  const search = page.getByRole('combobox', { name: 'Search Plant ID', exact: true });
  for (const name of ['Plant 149', 'Plant 150']) {
    await search.fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  }
  await search.press('Escape');
  await expect(picker).toHaveText('Plant 149, Plant 150');
  await picker.click();
  await search.fill('Plant 149');
  await page.getByRole('option', { name: 'Plant 149', exact: true }).click();
  await search.press('Escape');
  await expect(picker).toHaveText('Plant 150');
});

test('small choices stay inline and an empty large search has a useful message', async ({
  page,
}) => {
  for (const name of ['Region', 'Station type', 'Quality']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.getByRole('button', { name: 'One plant', exact: true }).click();
  await page.getByRole('combobox', { name: 'Plant ID', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search Plant ID', exact: true }).fill('missing plant');
  await expect(page.getByText('No matching options.', { exact: true })).toBeVisible();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(0);
});

test('the searchable popup has no accessibility violations', async ({ page }) => {
  await page.getByRole('button', { name: 'Several plants', exact: true }).click();
  await page.getByRole('combobox', { name: 'Plant ID', exact: true }).click();
  const result = await new AxeBuilder({ page })
    .include('[data-slot="a2ui-searchable-choice"]')
    .include('[data-slot="popover-content"]')
    .analyze();
  expect(result.violations).toEqual([]);
});

test('the long list stays bounded on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole('button', { name: 'Several plants', exact: true }).click();
  await page.getByRole('combobox', { name: 'Plant ID', exact: true }).click();
  const popup = page.getByRole('dialog', { name: 'Plant ID choices' });
  await expect(popup).toBeVisible();
  const bounds = await popup.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  const list = await page.getByRole('listbox').boundingBox();
  expect(list!.height).toBeLessThanOrEqual(288);
  await page.getByRole('combobox', { name: 'Search Plant ID', exact: true }).fill('150');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await page.getByRole('option', { name: 'Plant 150', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search Plant ID', exact: true }).press('Escape');
  await expect(page.getByRole('combobox', { name: 'Plant ID', exact: true })).toHaveText(
    'Plant 150',
  );
});
