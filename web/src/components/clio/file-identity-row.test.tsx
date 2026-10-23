import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { FileTypeIcon } from './file-type-icon';
import { FileIdentityRow } from './file-identity-row';

afterEach(cleanup);

it.each([
  ['report.PDF', '', 'pdf'],
  ['measurement', 'text/csv', 'csv'],
  ['report.docx', '', 'docx'],
  ['results.xlsx', '', 'xlsx'],
  ['unrecognized.science', 'application/octet-stream', 'science'],
])('recognizes %s without turning an unknown format into a known one', (name, mediaType, type) => {
  const { container } = render(
    <FileTypeIcon name={name} mediaType={mediaType} badge className="size-9" />,
  );
  expect(container.querySelector('[data-slot="file-type"]')).toHaveAttribute('data-type', type);
  expect(container.querySelector('[data-slot="file-type-label"]')).toHaveTextContent(
    type.toUpperCase(),
  );
});

it('keeps the small family glyph and 3D identity readable without tiny extension text', () => {
  const { container, rerender } = render(<FileTypeIcon name="table.csv" />);
  expect(container.querySelector('[data-slot="file-type-label"]')).toBeNull();
  expect(container.querySelector('[data-slot="file-type-glyph"]')).not.toBeNull();
  rerender(<FileTypeIcon name="simulation.glb" />);
  expect(container.querySelector('svg')).toHaveClass('lucide-box');
});

it('keeps the file open action and sibling download action independent', async () => {
  const open = vi.fn();
  const download = vi.fn();
  const user = userEvent.setup();
  render(
    <FileIdentityRow
      name="report.pdf"
      metadata="2.1 MB"
      onOpen={open}
      actions={<button onClick={download}>Download report</button>}
    />,
  );
  const openButton = screen.getByRole('button', { name: 'Open report.pdf' });
  expect(openButton).toHaveAccessibleDescription('2.1 MB');
  expect(openButton.querySelector('button')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Download report' }));
  expect(download).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
  await user.click(openButton);
  expect(open).toHaveBeenCalledOnce();
});
