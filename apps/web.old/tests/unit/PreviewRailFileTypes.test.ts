import { describe, expect, it } from 'vitest';
import {
  extOf,
  imageMimeForPath,
  langForPath,
} from '../../src/components/PreviewRailFileTypes.js';

describe('PreviewRailFileTypes', () => {
  it('extracts lowercase extensions from POSIX and Windows paths', () => {
    expect(extOf('src/app.TSX')).toBe('tsx');
    expect(extOf('src\\logo.PNG')).toBe('png');
    expect(extOf('README')).toBe('');
  });

  it('maps preview languages and image MIME types by extension', () => {
    expect(langForPath('src/app.tsx')).toBe('typescript');
    expect(langForPath('README.md')).toBe('markdown');
    expect(langForPath('archive.bin')).toBeNull();
    expect(imageMimeForPath('logo.png')).toBe('image/png');
    expect(imageMimeForPath('photo.jpeg')).toBe('image/jpeg');
    expect(imageMimeForPath('notes.txt')).toBeNull();
  });
});
