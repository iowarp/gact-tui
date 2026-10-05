import { describe, expect, it } from 'vitest';
import { readDroppedFolders } from './dropped-folders';

describe('dropped folder structure', () => {
  it('walks all directory-reader batches and retains paths instead of a fake folder file', async () => {
    const file = new File(['data'], 'input.csv', { type: 'text/csv' });
    const child = {
      name: file.name,
      isFile: true,
      isDirectory: false,
      file: (done: (file: File) => void) => done(file),
    };
    let page = 0;
    const directory = {
      name: 'Experiment',
      isFile: false,
      isDirectory: true,
      createReader: () => ({
        readEntries: (done: (entries: unknown[]) => void) => done(page++ === 0 ? [child] : []),
      }),
    };
    const files = await readDroppedFolders([directory as unknown as FileSystemEntry]);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('input.csv');
    expect(files[0].webkitRelativePath).toBe('Experiment/input.csv');
  });
  it('reports empty folders instead of creating empty file attachments', async () => {
    const directory = {
      name: 'Empty',
      isDirectory: true,
      createReader: () => ({ readEntries: (done: (entries: unknown[]) => void) => done([]) }),
    };
    await expect(readDroppedFolders([directory as unknown as FileSystemEntry])).rejects.toThrow(
      'no files',
    );
  });
});
