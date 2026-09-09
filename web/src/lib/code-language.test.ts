import { describe, expect, it } from 'vitest';
import { languageForPath } from './code-language';

describe('languageForPath', () => {
  it.each([
    ['example.py', 'python'],
    ['D:\\workspace\\worker.ps1', 'powershell'],
    ['/workspace/client.tsx', 'tsx'],
    ['/workspace/Dockerfile', 'dockerfile'],
    ['/workspace/Makefile', 'make'],
    ['unknown.data', 'text'],
  ])('maps %s to %s', (path, expected) => {
    expect(languageForPath(path)).toBe(expected);
  });
});
