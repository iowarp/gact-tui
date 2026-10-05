import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { vocab } from '@/lib/brand-vocabulary';
import { SourceMappingOptions } from './source-mapping-options';
import { type LinkAccess, type DownloadAccess } from './connected-source-labels';

afterEach(cleanup);

it('keeps copy access independent and requires acknowledgement for live writes', async () => {
  const linked = vi.fn();
  const downloaded = vi.fn();
  function Example() {
    const [link, setLink] = useState<LinkAccess>('read_only');
    const [copy, setCopy] = useState<DownloadAccess>('editable');
    const [confirmed, setConfirmed] = useState(false);
    return (
      <SourceMappingOptions
        canDownload
        canLink
        linked={false}
        linkAccess={link}
        downloadAccess={copy}
        confirmed={confirmed}
        allowed={['read_only', 'publish_later', 'write_through']}
        disabled={false}
        onLinkAccess={setLink}
        onDownloadAccess={setCopy}
        onConfirmed={setConfirmed}
        onLink={() => linked(link)}
        onDownload={() => downloaded(copy)}
      />
    );
  }
  render(<Example />);
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Linked folder access' }),
    'write_through',
  );
  expect(screen.getByRole('button', { name: 'Link folder' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Downloaded copy access' })).toHaveValue('editable');
  await user.click(screen.getByRole('button', { name: 'Download all' }));
  expect(downloaded).toHaveBeenCalledWith('editable');
  expect(linked).not.toHaveBeenCalled();
  await user.click(screen.getByRole('checkbox', { name: 'Allow changes to original files' }));
  await user.click(screen.getByRole('button', { name: 'Link folder' }));
  expect(linked).toHaveBeenCalledWith('write_through');
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Linked folder access' }),
    'publish_later',
  );
  expect(
    screen.getByText(`Keep edits in ${vocab.agent}. Review and publish when you are ready.`),
  ).toBeVisible();
});

it('offers only read access when the source cannot be edited', () => {
  render(
    <SourceMappingOptions
      canDownload={false}
      canLink
      linked={false}
      linkAccess="read_only"
      downloadAccess="editable"
      confirmed={false}
      allowed={['read_only']}
      disabled={false}
      onLinkAccess={vi.fn()}
      onDownloadAccess={vi.fn()}
      onConfirmed={vi.fn()}
      onLink={vi.fn()}
      onDownload={vi.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Download all' })).toBeNull();
  expect(screen.getByRole('option', { name: 'Edit locally, publish later' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'Update originals on save' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Link folder' })).toBeEnabled();
});
