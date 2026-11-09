import { expect, test } from '@playwright/test';
import { installResponseRatingFixture } from './response-rating-fixture.mjs';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('ratings toggle off and a top-right comment action attaches editable feedback', async ({
  page,
}) => {
  const fixture = await installResponseRatingFixture(page, endpoint);
  await page.goto(`/workspaces/${fixture.session.workspace_id}/sessions/${fixture.session.id}`);
  await expect(page.getByText(fixture.text, { exact: true })).toBeVisible();
  // Reply actions are named on hover; reveal them before each use.
  const rating = async (name: string) => {
    await page.locator(`#message-${fixture.messageId}`).hover();
    return page.getByRole('button', { name, exact: true });
  };
  await (await rating('Rate response')).click();
  await page.getByRole('menuitemradio', { name: 'Good response' }).click();
  await (await rating('Rated good response')).click();
  await page.getByRole('menuitemradio', { name: 'Good response' }).click();
  await (await rating('Rate response')).click();
  await page.getByRole('menuitemradio', { name: 'Bad response' }).click();
  await (await rating('Rated bad response')).click();
  const add = page.getByRole('menuitem', { name: 'Add feedback comment' });
  await expect
    .poll(async () => {
      const plus = await add.boundingBox();
      const row = await page.getByRole('menuitemradio', { name: 'Good response' }).boundingBox();
      return Boolean(
        plus && row && plus.x > row.x + row.width / 2 && plus.y + plus.height <= row.y + 1,
      );
    })
    .toBe(true);
  await add.click();
  const comment = page.getByRole('textbox', { name: 'Comment' });
  await expect(comment).toBeFocused();
  await comment.fill('The labels are useful; please explain the units.');
  fixture.state.failNext = true;
  await page.getByRole('button', { name: 'Save feedback', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your comment is still here');
  await expect(comment).toHaveValue('The labels are useful; please explain the units.');
  await page.getByRole('button', { name: 'Save feedback', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Rated bad response, with comment' }),
  ).toBeFocused();
  await page.reload();
  await (await rating('Rated bad response, with comment')).click();
  await page.getByRole('menuitemradio', { name: 'Bad response' }).click();
  await (await rating('Rate response, with comment')).click();
  await page.getByRole('menuitem', { name: 'Edit feedback comment' }).click();
  await expect(comment).toHaveValue('The labels are useful; please explain the units.');
  await comment.fill('An unsaved change.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rate response, with comment' })).toBeFocused();
  await (await rating('Rate response, with comment')).click();
  await page.getByRole('menuitem', { name: 'Edit feedback comment' }).click();
  await expect(comment).toHaveValue('The labels are useful; please explain the units.');
  await comment.fill('');
  await page.getByRole('button', { name: 'Save feedback', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rate response', exact: true })).toBeVisible();
  expect(fixture.state.history.map((row: { rating: string | null }) => row.rating)).toEqual([
    'good',
    null,
    'bad',
    'bad',
    null,
    null,
  ]);
  expect(fixture.state.feedback.comment).toBe('');
});
