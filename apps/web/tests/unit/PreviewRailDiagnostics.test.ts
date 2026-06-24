import { describe, expect, it } from 'vitest';
import {
  humanSize,
  imageFailureHint,
} from '../../src/components/PreviewRailDiagnostics.js';
import type { ContextFileContent } from '@clio/core';

function b64(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

describe('PreviewRailDiagnostics', () => {
  it('formats byte sizes for preview diagnostics', () => {
    expect(humanSize(undefined)).toBe('');
    expect(humanSize(42)).toBe('42 B');
    expect(humanSize(1536)).toBe('1.5 KB');
    expect(humanSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('explains JSON/text returned for an image path', () => {
    const content: ContextFileContent = {
      path: 'plot.png',
      size: 84,
      media_type: 'image/png',
      encoding: 'base64',
      data: b64('{"detail":"not an image"}'),
    };

    expect(imageFailureHint(content, 68)).toContain('JSON/text');
    expect(imageFailureHint(content, 68)).toContain('84 B read, 68 B listed');
  });

  it('explains source media-type transformations', () => {
    const content: ContextFileContent = {
      path: 'plot.png',
      size: 84,
      media_type: 'image/png',
      source_media_type: 'application/json',
      encoding: 'base64',
      data: b64('{"detail":"not an image"}'),
    };

    expect(imageFailureHint(content, 68)).toContain(
      'Backend read returned application/json for a image/png file',
    );
    expect(imageFailureHint(content, 68)).toContain('transformed the bytes');
  });
});
