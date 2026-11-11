// Process resource sampling for the perf harness: resident memory and CPU of
// the browser/webview tree, the backend and helper servers.
//
// Windows reads Win32_Process (working set, private bytes, CPU times) in one
// PowerShell call per sample; other platforms read `ps`.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** One snapshot of every process: {pid, ppid, name, rssMB, privateMB, cpuSeconds}. */
export async function snapshotProcesses() {
  if (process.platform === 'win32') {
    const script =
      'Get-CimInstance Win32_Process | ForEach-Object { "{0}|{1}|{2}|{3}|{4}|{5}" -f $_.ProcessId,$_.ParentProcessId,$_.Name,$_.WorkingSetSize,$_.PrivatePageCount,($_.KernelModeTime + $_.UserModeTime) }';
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      },
    );
    return stdout
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        const [pid, ppid, name, ws, priv, cpu100ns] = line.split('|');
        return {
          pid: Number(pid),
          ppid: Number(ppid),
          name,
          rssMB: Number(ws) / 2 ** 20,
          privateMB: Number(priv) / 2 ** 20,
          cpuSeconds: Number(cpu100ns) / 1e7,
        };
      });
  }
  const { stdout } = await run('ps', ['-A', '-o', 'pid=,ppid=,rss=,time=,comm='], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [pid, ppid, rss, time, ...name] = line.trim().split(/\s+/u);
      const parts = time.replace('-', ':').split(':').map(Number);
      const cpuSeconds = parts.reduce((total, part) => total * 60 + part, 0);
      return {
        pid: Number(pid),
        ppid: Number(ppid),
        name: name.join(' '),
        rssMB: Number(rss) / 1024,
        privateMB: null,
        cpuSeconds,
      };
    });
}

/** The pid and all its descendants. */
export function tree(snapshot, rootPid) {
  const children = new Map();
  for (const row of snapshot) {
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(row);
  }
  const root = snapshot.find((row) => row.pid === rootPid);
  if (!root) return [];
  const out = [root];
  for (let index = 0; index < out.length; index += 1) {
    for (const child of children.get(out[index].pid) ?? []) {
      if (child.pid !== out[index].pid) out.push(child);
    }
  }
  return out;
}

const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0);

/** Summarise a set of processes into one row. */
export function summarize(rows) {
  return {
    processes: rows.length,
    rssMB: Math.round(sum(rows, 'rssMB')),
    privateMB: rows.some((row) => row.privateMB === null)
      ? null
      : Math.round(sum(rows, 'privateMB')),
    cpuSeconds: Number(sum(rows, 'cpuSeconds').toFixed(2)),
    largest: rows
      .slice()
      .sort((a, b) => b.rssMB - a.rssMB)
      .slice(0, 3)
      .map((row) => ({ pid: row.pid, name: row.name, rssMB: Math.round(row.rssMB) })),
  };
}

/** The pid listening on a local TCP port (backend discovery). */
export async function pidForPort(port) {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `(Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`,
        ],
        { windowsHide: true },
      );
      const pid = Number.parseInt(stdout.trim(), 10);
      return Number.isFinite(pid) ? pid : null;
    }
    const { stdout } = await run('lsof', ['-t', `-iTCP:${Number(port)}`, '-sTCP:LISTEN']);
    const pid = Number.parseInt(stdout.trim().split('\n')[0], 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Sample named process groups. `groups` maps a label to either a root pid
 * (whole tree) or a list of pids (exact set).
 */
export async function sampleGroups(groups) {
  const snapshot = await snapshotProcesses();
  const byPid = new Map(snapshot.map((row) => [row.pid, row]));
  const result = {};
  for (const [label, target] of Object.entries(groups)) {
    if (target === null || target === undefined) continue;
    const rows = Array.isArray(target)
      ? target.map((pid) => byPid.get(pid)).filter(Boolean)
      : tree(snapshot, target);
    if (rows.length) result[label] = summarize(rows);
  }
  return { at: Date.now(), groups: result };
}

/** CPU utilisation (% of one core) per group between two samples. */
export function cpuBetween(first, second) {
  const seconds = (second.at - first.at) / 1000;
  const out = {};
  for (const [label, group] of Object.entries(second.groups)) {
    const before = first.groups[label];
    if (!before || seconds <= 0) continue;
    out[label] = Number((((group.cpuSeconds - before.cpuSeconds) / seconds) * 100).toFixed(1));
  }
  return out;
}

/** Renderer/GPU/browser pids of a Playwright Chromium browser via CDP. */
export async function browserPids(browser) {
  try {
    const session = await browser.newBrowserCDPSession();
    const info = await session.send('SystemInfo.getProcessInfo');
    await session.detach();
    return info.processInfo.map((row) => ({ pid: row.id, type: row.type }));
  } catch {
    return [];
  }
}
