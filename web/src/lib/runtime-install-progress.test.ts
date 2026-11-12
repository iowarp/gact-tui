import { expect, it } from 'vitest';
import {
  describeInstallProgress,
  readInstallLine,
  type RuntimeInstallProgress,
} from './runtime-install-progress';

// install.ps1's own lines from a lite first run (0.9.6.1).
const LINES = [
  '==> Resolving the latest stable release',
  '==> Downloading and unpacking the CLIO runtime (gact-runtime-0.9.6.1-windows-x64.tar.zst, 663 MB)',
  '==> Downloaded 36 of 687 MB (7.2 MB/s)',
  '==> Downloaded 406 of 687 MB (30.4 MB/s)',
  '==> Installing managed Python/uv and Node/pnpm packages and Office rendering',
  '==> Installing uv into D:\\runs\\bin (from the CLIO runtime)',
  '==> Checking which CLIO version wrote your data',
  '==> Migrating the CLIO store (clio-agent migrate) while the managed packages are prepared',
  '==> Finishing the managed packages, Office rendering and the CLIO store',
  '==> Installing launcher: D:\\runs\\bin\\clio.cmd',
];

function fold(lines: readonly string[]) {
  const seen: (RuntimeInstallProgress | undefined)[] = [];
  let progress: RuntimeInstallProgress | undefined;
  for (const line of lines) {
    progress = readInstallLine(progress, line, 1000);
    seen.push(progress);
  }
  return seen;
}

it('follows an install from download to the finishing steps, never backwards', () => {
  const seen = fold(LINES);
  expect(seen.map((progress) => progress?.phase)).toEqual([
    'resolving',
    'downloading',
    'downloading',
    'downloading',
    'packages',
    'packages',
    'store',
    'store',
    'store',
    'finishing',
  ]);
  expect(seen[3]).toMatchObject({ downloadedMb: 406, totalMb: 687 });
  expect(describeInstallProgress(seen[3]!, 1000)).toEqual({
    line: 'Downloading the runtime: 406 of 687 MB',
    fraction: 406 / 687,
  });
  expect(describeInstallProgress(seen[4]!, 1000).line).toBe(
    'Preparing the managed packages and Office',
  );
});

it('ignores lines that say nothing about progress', () => {
  expect(readInstallLine(undefined, 'some tool output')).toBeUndefined();
});
