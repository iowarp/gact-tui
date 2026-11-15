import { describe, expect, it } from 'vitest';
import { languageForPath, resolveCodeLanguage } from './code-language';

describe('languageForPath', () => {
  it.each([
    ['example.py', 'python'],
    ['D:\\workspace\\worker.ps1', 'powershell'],
    ['/workspace/client.tsx', 'tsx'],
    ['/workspace/Dockerfile', 'dockerfile'],
    ['/workspace/Makefile', 'make'],
    ['/workspace/bell.qasm', 'openqasm'],
    ['unknown.data', 'text'],
  ])('maps %s to %s', (path, expected) => {
    expect(languageForPath(path)).toBe(expected);
  });
});

describe('resolveCodeLanguage', () => {
  it.each([
    ['python', 'python'],
    ['py', 'py'],
    ['QASM', 'openqasm'],
    ['qasm3', 'openqasm'],
    ['openqasm', 'openqasm'],
    ['not-a-language', undefined],
    [undefined, undefined],
  ])('resolves %s to %s', (name, expected) => {
    expect(resolveCodeLanguage(name)).toBe(expected);
  });
});
