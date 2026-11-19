import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hdf5ObjectReference, isHdf5File, parseHdf5Mention } from './composer-hdf5-references';
import { hdf5FileKey, setHdf5Selection, useHdf5Selection } from './hdf5-selection-store';

describe('HDF5 selection for Add to message', () => {
  it('drills into NetCDF-4 files like any HDF5 file', () => {
    expect(isHdf5File('era5/msl.nc')).toBe(true);
    expect(isHdf5File('run.NC4')).toBe(true);
    expect(parseHdf5Mention('era5/msl.nc::/MS')).toEqual({
      file: 'era5/msl.nc',
      group: '/',
      filter: 'MS',
    });
  });

  it('follows the object selected in the viewer, ignoring the file root', () => {
    const { result } = renderHook(() => useHdf5Selection('w', 'era5/msl.nc'));
    expect(result.current).toBeUndefined();
    act(() => setHdf5Selection(hdf5FileKey('w', 'era5/msl.nc'), '/MSL'));
    expect(result.current).toBe('/MSL');
    act(() => setHdf5Selection(hdf5FileKey('w', 'era5/msl.nc'), '/'));
    expect(result.current).toBeUndefined();
  });

  it('references the selected dataset exactly as the composer does', () => {
    expect(hdf5ObjectReference('era5/msl.nc', '/MSL', 'Selected in the viewer')).toEqual({
      kind: 'workspace_file',
      id: 'era5/msl.nc::/MSL',
      label: 'msl.nc › /MSL',
      detail: 'Selected in the viewer',
      media_type: 'application/x-hdf5',
      revision: '',
      navigation: { path: 'era5/msl.nc', locator: '/MSL' },
    });
  });
});
