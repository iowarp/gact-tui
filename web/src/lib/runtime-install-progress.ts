/**
 * What a first-use runtime install is doing, read from the installer's own progress
 * lines (`install.ps1` / `install.sh`, streamed as `clio:install-progress`).
 */
export type RuntimeInstallPhase =
  | 'resolving'
  | 'downloading'
  | 'unpacking'
  | 'packages'
  | 'store'
  | 'finishing';

export interface RuntimeInstallProgress {
  phase: RuntimeInstallPhase;
  /** Megabytes downloaded so far, while downloading. */
  downloadedMb?: number;
  /** Megabytes the whole download takes, once the installer has said. */
  totalMb?: number;
  /** When the installer last reported (ms since the epoch). */
  at: number;
}

const PHASES: readonly { phase: RuntimeInstallPhase; pattern: RegExp }[] = [
  { phase: 'resolving', pattern: /^Resolving /i },
  { phase: 'unpacking', pattern: /^(Unpacking|Finishing unpacking)\b/i },
  { phase: 'packages', pattern: /^(Installing managed |Finishing the managed packages)/i },
  {
    phase: 'store',
    pattern: /^(Checking which .* version wrote your data|Migrating the .* store)/i,
  },
  {
    phase: 'finishing',
    pattern: /^(Provisioning |Web UI bundle installed|Installing launcher|Installing uninstaller)/i,
  },
];

const DOWNLOADING = /^Downloading and unpacking the .* runtime \(.*?, (\d+) MB\)/i;
const DOWNLOADED = /^Downloaded (\d+)(?: of (\d+))? MB/i;
const PHASE_ORDER: readonly RuntimeInstallPhase[] = [
  'resolving',
  'downloading',
  'unpacking',
  'packages',
  'store',
  'finishing',
];

/** The progress after one installer line; lines that say nothing new keep it. */
export function readInstallLine(
  previous: RuntimeInstallProgress | undefined,
  rawLine: string,
  now: number = Date.now(),
): RuntimeInstallProgress | undefined {
  const line = rawLine.replace(/^\s*==>\s*/, '').trim();
  const started = DOWNLOADING.exec(line);
  if (started)
    return { phase: 'downloading', downloadedMb: 0, totalMb: Number(started[1]), at: now };
  const downloaded = DOWNLOADED.exec(line);
  if (downloaded) {
    const totalMb = downloaded[2] ? Number(downloaded[2]) : previous?.totalMb;
    // The installer reports bytes; a late line never moves an install backwards.
    if (previous && rank(previous.phase) > rank('downloading')) return previous;
    return { phase: 'downloading', downloadedMb: Number(downloaded[1]), totalMb, at: now };
  }
  const match = PHASES.find(({ pattern }) => pattern.test(line));
  if (!match) return previous;
  if (previous && rank(match.phase) < rank(previous.phase)) return { ...previous, at: now };
  return { phase: match.phase, at: now };
}

function rank(phase: RuntimeInstallPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Older installers say nothing between their last download line and the package step,
 * while the archive's tail is unpacked. Download lines come every few seconds, so a
 * longer silence after the last one means the download has ended.
 */
export const DOWNLOAD_SILENCE_MS = 12_000;

/** One line for the step that is preparing the runtime, and its bar while downloading. */
export function describeInstallProgress(
  progress: RuntimeInstallProgress,
  now: number,
): { line: string; fraction?: number } {
  switch (progress.phase) {
    case 'resolving':
      return { line: 'Finding the release to install' };
    case 'downloading': {
      const total = progress.totalMb;
      const done = Math.min(progress.downloadedMb ?? 0, total ?? Number.POSITIVE_INFINITY);
      if (now - progress.at >= DOWNLOAD_SILENCE_MS && (progress.downloadedMb ?? 0) > 0)
        return { line: 'Unpacking the runtime' };
      if (!total) return { line: `Downloading the runtime: ${done} MB` };
      return { line: `Downloading the runtime: ${done} of ${total} MB`, fraction: done / total };
    }
    case 'unpacking':
      return { line: 'Unpacking the runtime' };
    case 'packages':
      return { line: 'Preparing the managed packages and Office' };
    case 'store':
      return { line: 'Updating your local data' };
    case 'finishing':
      return { line: 'Finishing the installation' };
  }
}
