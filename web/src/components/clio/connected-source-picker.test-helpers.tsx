import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, vi, type Mock } from 'vitest';
import { toMessagePart } from '@/lib/composer-reference-domain';
import { ConnectedSourcePicker } from './connected-source-picker';

/** Exercise resource attachment independently of the source selection matrix. */
export async function assertFolderResourceAttachment(attachSourceFolder: Mock) {
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} onSelect={onSelect} />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Your sources' }));
  await user.click(await screen.findByRole('button', { name: /^OPAL inputs/ }));
  await user.click(screen.getByRole('button', { name: 'Add source to message' }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
  expect(attachSourceFolder).toHaveBeenCalledWith('w', 's1', false, '', 'draft_test');
  const reference = onSelect.mock.calls[0][0];
  expect(reference).toMatchObject({
    label: 'OPAL inputs',
    navigation: { source_id: 's1', source_kind: 'folder' },
  });
  expect(toMessagePart(reference)).toMatchObject({
    type: 'resource_ref',
    resource_id: 'res_folder',
    resource_revision: '1',
    name: 'OPAL inputs',
  });
}
