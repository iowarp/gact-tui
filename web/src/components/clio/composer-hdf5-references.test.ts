import type { WorkspaceReference } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  hdf5DrillQuery,
  isHdf5File,
  parseHdf5Mention,
  readableDtype,
} from './composer-hdf5-references';

function fileReference(id: string, navigation: Record<string, unknown> = {}): WorkspaceReference {
  return {
    kind: 'workspace_file',
    id,
    label: id,
    detail: '',
    media_type: '',
    revision: '',
    navigation,
  };
}

describe('HDF5 mentions', () => {
  it('reads the file, the group and the typed filter of file::/group/filter', () => {
    expect(parseHdf5Mention('data/run.h5::/')).toEqual({
      file: 'data/run.h5',
      group: '/',
      filter: '',
    });
    expect(parseHdf5Mention('data/run.h5::/entry/da')).toEqual({
      file: 'data/run.h5',
      group: '/entry',
      filter: 'da',
    });
    expect(parseHdf5Mention('run.nxs::')).toEqual({ file: 'run.nxs', group: '/', filter: '' });
  });

  it('is not a mention without an HDF5 file before :: and a path after it', () => {
    expect(parseHdf5Mention('run.h5')).toBeUndefined();
    expect(parseHdf5Mention('notes.txt::/a')).toBeUndefined();
    expect(parseHdf5Mention('run.h5::entry')).toBeUndefined();
    expect(parseHdf5Mention('::/entry')).toBeUndefined();
  });

  it('drills into an HDF5 file or group, never into a dataset or another file', () => {
    expect(hdf5DrillQuery(fileReference('data/run.h5'))).toBe('data/run.h5::/');
    expect(hdf5DrillQuery(fileReference('data/run.h5::/entry', { hdf5_kind: 'group' }))).toBe(
      'data/run.h5::/entry/',
    );
    expect(
      hdf5DrillQuery(fileReference('data/run.h5::/entry/I', { hdf5_kind: 'dataset' })),
    ).toBeUndefined();
    expect(hdf5DrillQuery(fileReference('README.md'))).toBeUndefined();
    expect(isHdf5File('A/B.HDF5')).toBe(true);
  });

  it('names dtypes the way readers do', () => {
    expect(readableDtype('<i4')).toBe('int32');
    expect(readableDtype('>f8')).toBe('float64');
    expect(readableDtype('|u1')).toBe('uint8');
    expect(readableDtype('|b1')).toBe('bool');
    expect(readableDtype('|O')).toBe('|O');
  });
});
