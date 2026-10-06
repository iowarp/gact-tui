import { expect, it } from 'vitest';
import { archiveFileHref } from './archive-file-reference';

it('links actual recorded artifacts and inputs from their original file identity', () => {
  const inventory = {
    files: [{ archive_path: 'effects/input/data.csv', source_path: 'D:\\Source\\data.csv' }],
    artifacts: [
      { artifact_id: 'a', archive_path: 'effects/a/report.md', path: 'D:\\Source\\report.md' },
    ],
  };
  expect(archiveFileHref('artifact://a', inventory)).toBe('effects/a/report.md');
  expect(archiveFileHref('D:/Source/report.md', inventory)).toBe('effects/a/report.md');
  expect(archiveFileHref('D:/SOURCE/data.csv', inventory)).toBe('effects/input/data.csv');
  expect(archiveFileHref('D:/Source/unrecorded.csv', inventory)).toBeUndefined();
});

it('resolves full snapshot paths only for exact inventoried files', () => {
  const inventory = {
    files: [{ archive_path: 'workspace/w/0/folder/Data File.csv' }],
    artifacts: [],
    workspace_folders: [{ source_path: 'D:\\Source', archive_path: 'workspace/w/0' }],
  };
  expect(archiveFileHref('D:/Source/folder/Data File.csv', inventory)).toBe(
    'workspace/w/0/folder/Data%20File.csv',
  );
  expect(archiveFileHref('D:/Source/../private.csv', inventory)).toBeUndefined();
  expect(archiveFileHref('D:/Source/not-recorded.csv', inventory)).toBeUndefined();
});
