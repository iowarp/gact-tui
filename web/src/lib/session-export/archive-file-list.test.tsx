import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ArchiveFileList } from './archive-file-list';

afterEach(cleanup);

describe('large archive file lists', () => {
  it('bounds rendered links and searches the entire snapshot after paging', () => {
    const files = Array.from({ length: 135_001 }, (_, index) => ({
      archive_path: `workspace/images/frame-${index}.png`,
      bytes: 123,
    }));
    render(<ArchiveFileList files={files} />);
    expect(screen.getAllByRole('link')).toHaveLength(100);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('status')).toHaveTextContent('Page 2 of 1,351');
    fireEvent.change(screen.getByLabelText('Search included files'), {
      target: { value: 'FRAME-135000' },
    });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveTextContent('frame-135000.png');
    expect(screen.getByRole('status')).toHaveTextContent('Page 1 of 1');
  });

  it('preserves special characters in relative file links and reports empty searches', () => {
    render(<ArchiveFileList files={[{ archive_path: 'workspace/plot #1%.png', bytes: 4 }]} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'workspace/plot%20%231%25.png');
    fireEvent.change(screen.getByLabelText('Search included files'), {
      target: { value: 'missing' },
    });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('No files match your search.')).toBeVisible();
  });
});
