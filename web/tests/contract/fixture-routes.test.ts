// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The browser suite fails every test with an unexpected 404 when the app calls a
// core route the e2e fixture does not serve. Catch that drift here, once, with
// the route named. Routes the fixture deliberately leaves unserved are listed in
// fixture-unserved-routes.json; regenerate it with UPDATE_FIXTURE_ROUTES=1.
const coreDir = fileURLToPath(new URL('../../../packages/core/src/v3/', import.meta.url));
const fixtureServer = fileURLToPath(new URL('../../e2e/fixture-server.mjs', import.meta.url));
const unservedFile = fileURLToPath(new URL('./fixture-unserved-routes.json', import.meta.url));
const sampleId = 'sess_flat_ndp';

function coreRoutes(): string[] {
  const routes = new Set<string>();
  for (const name of readdirSync(coreDir)) {
    if (!name.endsWith('.ts') || name.includes('.test.')) continue;
    const lines = readFileSync(coreDir + name, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const path = /path:\s*[`'"](\/v1\/[^`'"]*)/u.exec(line)?.[1];
      if (!path) return;
      const nearby = lines.slice(Math.max(0, index - 6), index + 6).join('\n');
      const method = /method:\s*'(GET|POST|PUT|PATCH|DELETE)'/u.exec(nearby)?.[1] ?? 'GET';
      const template = path
        .replace(/\/\$\{[^}]*\}/gu, '/:id')
        .replace(/\$\{.*$/u, '')
        .split('?')[0];
      routes.add(`${method} ${template}`);
    });
  }
  return [...routes].sort();
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

async function served(origin: string, route: string): Promise<boolean> {
  const [method, template] = route.split(' ') as [string, string];
  try {
    const response = await fetch(origin + template.replaceAll(':id', sampleId), {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
      signal: AbortSignal.timeout(3_000),
    });
    const body = response.status === 404 ? await response.text() : '';
    void response.body?.cancel().catch(() => undefined);
    return !(response.status === 404 && body.includes('"error":"not_found"'));
  } catch {
    // A handler that holds the request open (an event stream) is a served route.
    return true;
  }
}

describe('e2e fixture route contract', () => {
  let fixture: ChildProcess | undefined;
  let origin = '';

  beforeAll(async () => {
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    fixture = spawn(process.execPath, [fixtureServer], {
      env: { ...process.env, CLIO_FIXTURE_PORT: String(port) },
      stdio: 'ignore',
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if ((await fetch(`${origin}/v1/capabilities`)).ok) return;
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('e2e fixture server did not start');
  }, 20_000);

  afterAll(() => {
    fixture?.kill();
  });

  it('serves every core route except the declared unserved list', async () => {
    const routes = coreRoutes();
    expect(routes.length).toBeGreaterThan(100);
    const unserved: string[] = [];
    for (const route of routes) if (!(await served(origin, route))) unserved.push(route);
    if (process.env['UPDATE_FIXTURE_ROUTES'] === '1') {
      writeFileSync(unservedFile, `${JSON.stringify(unserved, null, 2)}\n`);
    }
    const declared = JSON.parse(readFileSync(unservedFile, 'utf8')) as string[];
    expect(
      unserved.filter((route) => !declared.includes(route)),
      'Core routes missing from web/e2e/fixture-server.mjs. Serve them there, or list them in web/tests/contract/fixture-unserved-routes.json if no browser test reaches them.',
    ).toEqual([]);
    expect(
      declared.filter((route) => !unserved.includes(route)),
      'Listed as unserved but now served or removed from core. Delete them from fixture-unserved-routes.json.',
    ).toEqual([]);
  }, 60_000);
});
