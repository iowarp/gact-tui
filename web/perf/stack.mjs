// Starts the deterministic stack the perf and screenshot harnesses drive:
// the e2e fixture server, the scale overlay in front of it and `vite preview`
// of the production build. Ports default away from the e2e suite (18799/4173)
// and the usual dev stack (8100/5173) so concurrent checkouts do not collide.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export const basePorts = {
  fixture: Number(process.env['CLIO_PERF_FIXTURE_PORT'] ?? 18811),
  proxy: Number(process.env['CLIO_PERF_PROXY_PORT'] ?? 18812),
  preview: Number(process.env['CLIO_PERF_PREVIEW_PORT'] ?? 5181),
};

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(port, label, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`${label} exited early with code ${child.exitCode}`);
    if (await portOpen(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${label} did not open port ${port}`);
}

/**
 * Start the stack; returns endpoints, child pids and a stop function.
 * `portOffset` shifts every default port so two harnesses can run at once.
 */
export async function startStack({ quiet = true, portOffset = 0, fixedClock } = {}) {
  const ports = Object.fromEntries(
    Object.entries(basePorts).map(([name, port]) => [name, port + portOffset]),
  );
  if (!existsSync(join(webRoot, 'dist', 'index.html'))) {
    throw new Error('web/dist is missing. Run `pnpm build` first (or pass --build).');
  }
  for (const [name, port] of Object.entries(ports)) {
    if (await portOpen(port)) {
      throw new Error(
        `Port ${port} (${name}) is already in use. Set CLIO_PERF_${name.toUpperCase()}_PORT.`,
      );
    }
  }
  const children = [];
  const stdio = quiet ? 'ignore' : 'inherit';
  const launch = (label, command, args, env) => {
    const child = spawn(command, args, {
      cwd: webRoot,
      env: { ...process.env, ...env },
      stdio,
      windowsHide: true,
    });
    children.push({ label, child });
    return child;
  };
  const stop = async () => {
    for (const { child } of children.reverse()) {
      if (child.exitCode !== null) continue;
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        child.kill('SIGTERM');
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  };
  try {
    // `fixedClock` freezes the fixture processes' wall clock (screenshots).
    const clock = fixedClock ? ['--import', './perf/fixed-clock.mjs'] : [];
    const clockEnv = fixedClock ? { CLIO_PERF_FIXED_CLOCK: fixedClock } : {};
    const fixture = launch('fixture', process.execPath, [...clock, 'e2e/fixture-server.mjs'], {
      ...clockEnv,
      CLIO_FIXTURE_PORT: String(ports.fixture),
    });
    await waitForPort(ports.fixture, 'fixture server', fixture);
    const proxy = launch('scale overlay', process.execPath, [...clock, 'perf/scale-fixture.mjs'], {
      ...clockEnv,
      CLIO_FIXTURE_PORT: String(ports.fixture),
      CLIO_PERF_PROXY_PORT: String(ports.proxy),
    });
    await waitForPort(ports.proxy, 'scale overlay', proxy);
    const vite = join(webRoot, 'node_modules', 'vite', 'bin', 'vite.js');
    const preview = launch('vite preview', process.execPath, [
      vite,
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(ports.preview),
      '--strictPort',
    ]);
    await waitForPort(ports.preview, 'vite preview', preview);
    return {
      endpoint: `http://127.0.0.1:${ports.proxy}`,
      fixtureEndpoint: `http://127.0.0.1:${ports.fixture}`,
      baseURL: `http://127.0.0.1:${ports.preview}`,
      pids: { fixture: fixture.pid, proxy: proxy.pid, preview: preview.pid },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

/** Reset fixture state and apply one scale scenario. */
export async function applyScenario(stack, scenario = {}) {
  const reset = await fetch(`${stack.fixtureEndpoint}/__test/reset`, { method: 'POST' });
  if (!reset.ok) throw new Error(`fixture reset failed: ${reset.status}`);
  const response = await fetch(`${stack.endpoint}/__perf/scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scenario),
  });
  if (!response.ok) throw new Error(`scenario failed: ${response.status}`);
  return response.json();
}

/** Drain the overlay's request log. */
export async function drainRequests(stack) {
  const response = await fetch(`${stack.endpoint}/__perf/requests`);
  return (await response.json()).requests ?? [];
}
