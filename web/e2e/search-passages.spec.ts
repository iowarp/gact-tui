import { expect, test } from '@playwright/test';
import { installSearchFixture } from './search-fixture.mjs';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
test('search orders sessions first, highlights snippets, and focuses the actual message passage', async ({
  page,
}) => {
  const fixture = await installSearchFixture(page, endpoint);
  await page.goto(`/workspaces/${fixture.workspace.id}/sessions/${fixture.session.id}`);
  await expect(page.getByText('Review the study protocol.', { exact: true })).toBeAttached();
  await page.keyboard.press('ControlOrMeta+KeyK');
  await expect(page.getByPlaceholder('Search work, files, artifacts, or actions…')).toBeFocused();
  const input = page.getByPlaceholder('Search work, files, artifacts, or actions…');
  await input.fill('plant');
  await expect(
    page.getByRole('option', { name: /Plant study review.*Open matching passage/u }),
  ).toBeVisible();
  const headings = await page.locator('[cmdk-group-heading]').allTextContents();
  const group = (label: string) => headings.findIndex((heading) => heading.startsWith(label));
  expect(group('Conversations')).toBeGreaterThanOrEqual(0);
  expect(group('Conversations')).toBeLessThan(group('Files'));
  // File rows read basename, then directory, then size.
  await expect(
    page.getByRole('option', { name: /^plant-study\.md notes\b/u }).locator('mark'),
  ).toHaveText('plant');
  await input.fill(fixture.phrase);
  const hit = page.getByRole('option', { name: /Open matching passage/u });
  await expect(hit.locator('mark')).toHaveText(fixture.phrase);
  await hit.click();
  await expect(page).toHaveURL(/#message-msg_search_passage\?part=part_search_passage&find=/u);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...CSS.highlights.keys()]
          .filter((key) => key.startsWith('clio-search-'))
          .flatMap((key) => [...CSS.highlights.get(key)!].map((range) => range.toString())),
      ),
    )
    .toContain(fixture.phrase);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const ranges = [...CSS.highlights.entries()]
          .filter(([key]) => key.startsWith('clio-search-'))
          .flatMap(([, value]) => [...value]);
        const bounds = ranges[0]?.getBoundingClientRect();
        return Boolean(bounds && bounds.top > 30 && bounds.bottom < innerHeight - 100);
      }),
    )
    .toBe(true);
});
test('Tab enters the dedicated assistant, Enter submits, and a scoped citation opens the correct file', async ({
  page,
}) => {
  const fixture = await installSearchFixture(page, endpoint);
  await page.goto(`/workspaces/${fixture.workspace.id}/sessions/${fixture.session.id}`);
  await expect(page.getByText('Review the study protocol.', { exact: true })).toBeAttached();
  await page.keyboard.press('ControlOrMeta+KeyK');
  await page
    .getByPlaceholder('Search work, files, artifacts, or actions…')
    .fill('Where is the reviewer handoff?');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: /^Ask .+ Search$/u })).toBeFocused();
  expect(fixture.state.created).toBe(0);
  await page.getByRole('textbox', { name: /^Ask .+ Search$/u }).press('Enter');
  await expect(page.getByRole('link', { name: 'Read the archived notes' })).toBeVisible();
  await page.getByRole('link', { name: 'Read the archived notes' }).click();
  await expect(page.getByLabel('Matching file passage').locator('mark')).toHaveText(fixture.phrase);
  await expect.poll(() => fixture.state.deleted).toEqual(['sess_search_fixture']);
  expect(fixture.state.submitted).toHaveLength(1);
  expect(fixture.state.submitted[0].parts[0].text).toBe('Where is the reviewer handoff?');
});

test('search switches modes in both directions with its draft and a single compact input row', async ({
  page,
}) => {
  const fixture = await installSearchFixture(page, endpoint);
  await page.goto(`/workspaces/${fixture.workspace.id}/sessions/${fixture.session.id}`);
  await expect(page.getByText('Review the study protocol.', { exact: true })).toBeAttached();
  await page.keyboard.press('ControlOrMeta+KeyK');
  const input = page.getByPlaceholder('Search work, files, artifacts, or actions…');
  await expect(input).toBeFocused();
  await page.keyboard.type('Keep my draft');
  const shortcut = page.getByRole('button', { name: /^Ask .+ Tab$/u });
  await expect(shortcut).toBeVisible();
  // The Ask shortcut is a footer hint; the search input keeps one compact row.
  expect(
    await shortcut.evaluate((button) => Boolean(button.closest('[data-slot="picker-footer"]'))),
  ).toBe(true);
  expect(
    await input.evaluate(
      (element) =>
        (element.closest('[data-slot="input-group"]') ??
          element.parentElement)!.getBoundingClientRect().height,
    ),
  ).toBeLessThan(56);
  const assistant = page.getByRole('textbox', { name: /^Ask .+ Search$/u });
  await page.keyboard.press('Tab');
  await expect(assistant).toBeFocused();
  await expect(assistant).toHaveValue('Keep my draft');
  await page.keyboard.press('Shift+Tab');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Keep my draft');
  await page.keyboard.press('Tab');
  await expect(assistant).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Keep my draft');
  await shortcut.click();
  await expect(assistant).toBeFocused();
  await page.getByRole('button', { name: /^Choose .+ Search model$/u }).click();
  const picker = page.getByRole('dialog', { name: /^Choose .+ Search model$/u });
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(assistant).toBeVisible();
  expect(fixture.state.created).toBe(0);
  await page.getByRole('button', { name: /^Choose .+ Search model$/u }).click();
  await picker.getByText('qwen3-vl-8b', { exact: true }).click();
  await expect(page.getByRole('button', { name: /^Choose .+ Search model$/u })).toContainText(
    'qwen3-vl-8b',
  );
  await assistant.press('Enter');
  await expect.poll(() => fixture.state.submitted).toHaveLength(1);
  expect(fixture.state.submitted[0].model).toEqual({
    provider_id: 'lmstudio',
    model_id: 'qwen3-vl-8b',
  });
  await expect(page.getByRole('link', { name: 'Read the archived notes' })).toBeVisible();
});
