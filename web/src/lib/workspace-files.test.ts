import { describe, expect, it } from 'vitest';
import { isClioInternalPath, visibleWorkspaceFiles } from './workspace-files';

describe('visible workspace files', () => {
  it('hides CLIO persistence while retaining user dotfiles', () => {
    expect(isClioInternalPath('.clio\\agent\\documents\\manifest.json')).toBe(true);
    expect(isClioInternalPath('.clio')).toBe(true);
    expect(isClioInternalPath('.clio-child-cache')).toBe(true);
    expect(isClioInternalPath('D:/workspace/.clio/artifacts/index.json')).toBe(true);
    expect(isClioInternalPath('.github/workflows/check.yml')).toBe(false);
    expect(
      visibleWorkspaceFiles([
        { path: '.clio/agent/state.json', type: 'file' },
        { path: '.github/workflows/check.yml', type: 'file' },
        { path: 'results/stations.csv', type: 'file' },
      ]).map((file) => file.path),
    ).toEqual(['.github/workflows/check.yml', 'results/stations.csv']);
  });
});
