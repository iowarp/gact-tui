import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const evidence = process.env['CLIO_REVIEW_EVIDENCE']!;
const fixture = process.env['CLIO_SSH_REVIEW_FIXTURE']!;
if (!fixture) throw new Error('Set CLIO_SSH_REVIEW_FIXTURE to the native acceptance fixture.');

test('Hide is reversible; Remove confirms and persists for imported and managed hosts', async ({
  page,
  request,
}, testInfo) => {
  const importedConfig = readFileSync(`${fixture}/config`);
  const invoke = async (command: string) =>
    await (await request.post('http://127.0.0.1:8200/invoke', { data: { command } })).json();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/review/ssh-hosts.html');
  const manager = page.getByRole('dialog', { name: 'Manage SSH hosts' });
  await expect(manager.getByRole('button', { name: 'Hide Ares review' })).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Remove Ares review' })).toBeVisible();
  await expect(
    manager.getByRole('button', { name: 'Remove imported-review.example.invalid' }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('hide-and-remove.png') });
  await manager.getByRole('button', { name: 'Hide Ares review' }).click();
  await expect(manager.getByRole('button', { name: 'Show Ares review' })).toBeVisible();
  await expect
    .poll(async () =>
      (await invoke('ssh_profiles_list')).map((host: { name: string }) => host.name),
    )
    .not.toContain('ares-review');
  await manager.getByRole('button', { name: 'Show Ares review' }).click();
  await expect
    .poll(async () =>
      (await invoke('ssh_profiles_list')).map((host: { name: string }) => host.name),
    )
    .toContain('ares-review');
  await manager.getByRole('button', { name: 'Remove imported-review.example.invalid' }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('Your OpenSSH configuration and SSH keys remain');
  await page.screenshot({ path: testInfo.outputPath('remove-imported-confirmation.png') });
  await confirmation.getByRole('button', { name: 'Keep host' }).click();
  expect(
    (await invoke('ssh_profiles_list_all')).map((host: { name: string }) => host.name),
  ).toContain('imported-review.example.invalid');
  await manager.getByRole('button', { name: 'Remove imported-review.example.invalid' }).click();
  await confirmation.getByRole('button', { name: 'Remove host', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(
    manager.getByRole('button', { name: 'Remove imported-review.example.invalid' }),
  ).toHaveCount(0);
  expect(readFileSync(`${fixture}/config`)).toEqual(importedConfig);
  await page.reload();
  await expect(manager.getByRole('button', { name: 'Remove Ares review' })).toBeVisible();
  await expect(
    manager.getByRole('button', { name: 'Remove imported-review.example.invalid' }),
  ).toHaveCount(0);
  await manager.getByRole('button', { name: 'Remove Ares review' }).click();
  await expect(confirmation).toContainText('pasted key used only by this profile');
  await confirmation.getByRole('button', { name: 'Remove host', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(manager.getByRole('button', { name: 'Remove Ares review' })).toHaveCount(0);
  expect(readFileSync(`${fixture}/clio/config`, 'utf8')).not.toContain('Host ares-review');
  const all = await invoke('ssh_profiles_list_all');
  expect(all.map((host: { name: string }) => host.name)).toEqual(['hidden-review']);
  expect(readFileSync(`${fixture}/config`)).toEqual(importedConfig);
  const preferences = JSON.parse(readFileSync(`${fixture}/preferences.json`, 'utf8'));
  expect(preferences.removed).toEqual(['ares-review', 'imported-review.example.invalid']);
  await manager.getByRole('button', { name: 'Show Hidden review' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('combobox', { name: 'Saved SSH host' }).click();
  await expect(page.getByRole('option', { name: 'Hidden review' })).toBeVisible();
  await expect(page.getByRole('option', { name: /imported-review|Ares review/ })).toHaveCount(0);
  expect(errors).toEqual([]);
  writeFileSync(
    `${evidence}/ssh-hosts-native-browser-receipt.json`,
    JSON.stringify(
      {
        fixture,
        importedConfigUnchanged: true,
        removed: preferences.removed,
        retained: all,
        reversibleHide: true,
        confirmationCancelled: true,
        confirmationAccepted: true,
        reloadPreservedRemoval: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
});
