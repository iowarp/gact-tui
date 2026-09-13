import { describe, expect, it } from 'vitest';
import { workspaceFilePath } from './workspace-file-path';

describe('workspace file identity', () => {
  it.each([
    ['D:\\Work\\report.txt', 'D:\\Work', 'report.txt'],
    ['d:/work/reports/Report.md', 'D:\\Work\\', 'reports/Report.md'],
    ['\\\\host\\share\\work\\report.txt', '\\\\host\\share\\work', 'report.txt'],
    ['/work/reports/report.md', '/work', 'reports/report.md'],
    ['reports\\report.md', 'D:\\Work', 'reports/report.md'],
    ['D:\\Workspace-other\\report.txt', 'D:\\Workspace', 'D:/Workspace-other/report.txt'],
    ['/WORK/report.txt', '/work', '/WORK/report.txt'],
    ['/work/report.txt', undefined, '/work/report.txt'],
  ])('maps %s against %s without guessing a basename', (path, root, expected) => {
    expect(workspaceFilePath(path, root)).toBe(expected);
  });
});
