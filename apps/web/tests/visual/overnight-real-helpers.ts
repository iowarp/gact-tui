import { chromium, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ENABLED = process.env['CLIO_OVERNIGHT_EXTENDED_UI'] === '1';
export const BACKEND_A = process.env['CLIO_BACKEND_A_URL'] ?? 'http://127.0.0.1:18131';
export const BACKEND_B = process.env['CLIO_BACKEND_B_URL'] ?? 'http://127.0.0.1:18132';
export const WORKSPACE_A_ROOT = process.env['CLIO_WORKSPACE_A_ROOT'] ?? '';

export const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

export interface WorkspaceRow {
  id: string;
  name?: string;
  root_path?: string;
}

export interface SessionRow {
  id: string;
  title?: string;
}

interface AgentRow {
  id?: string;
}

export let reachableA = false;
export let reachableB = false;
try {
  const [a, b] = await Promise.all([
    fetch(`${BACKEND_A}/v1/capabilities`, { signal: AbortSignal.timeout(2_000) }),
    fetch(`${BACKEND_B}/v1/capabilities`, { signal: AbortSignal.timeout(2_000) }),
  ]);
  reachableA = a.ok;
  reachableB = b.ok;
} catch {
  reachableA = false;
  reachableB = false;
}

export function shot(slug: string): string {
  return resolve(auditDir, `${slug}.png`);
}

export async function api<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${base} ${init.method ?? 'GET'} ${path} failed: ${r.status} ${body}`);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export async function diagnosticsJson<T>(base: string, path: string): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    headers: { 'content-type': 'application/json' },
  });
  const body = (await r.json().catch(async () => {
    const text = await r.text().catch(() => '');
    return { error: text || `HTTP ${r.status}` };
  })) as T;
  if (r.status < 200 || r.status >= 600) {
    throw new Error(`${base} GET ${path} failed: ${r.status} ${JSON.stringify(body)}`);
  }
  return body;
}

export async function cleanupValidationAgents(base: string): Promise<number> {
  const prefixes = [
    'file_editor_',
    'freshness_probe_',
    'streaming_probe_',
    'markdown_probe_',
  ];
  let deleted = 0;
  try {
    const agents = (await api<{ agents: AgentRow[] }>(base, '/v1/agents')).agents ?? [];
    for (const agent of agents) {
      const id = String(agent.id ?? '');
      if (!prefixes.some((prefix) => id.startsWith(prefix))) continue;
      try {
        await api(base, `/v1/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
        deleted += 1;
      } catch {
        // Best effort: stale validation agents should not block unrelated
        // catalog proof, but delete them when the backend supports it.
      }
    }
  } catch {
    // Older backends may not expose /v1/agents; keep the visual gate focused
    // on the catalog surface.
  }
  return deleted;
}

export async function firstWorkspace(base: string): Promise<WorkspaceRow> {
  const rows = await workspaces(base);
  const row = rows[0];
  if (!row?.id) throw new Error(`${base} has no workspace`);
  return row;
}

export async function workspaces(base: string): Promise<WorkspaceRow[]> {
  return (await api<{ workspaces: WorkspaceRow[] }>(base, '/v1/workspaces')).workspaces;
}

export async function workspaceByRoot(base: string, rootPath: string): Promise<WorkspaceRow> {
  const rows = await workspaces(base);
  const row = rows.find((workspace) => workspace.root_path === rootPath);
  if (row?.id) return row;
  if (!rootPath) return firstWorkspace(base);
  throw new Error(`${base} has no workspace rooted at ${rootPath}`);
}

export async function createSession(base: string, workspaceId: string, title: string): Promise<SessionRow> {
  return await api<SessionRow>(base, '/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({ title, workspace_id: workspaceId }),
  });
}

export async function createBackendASession(titlePrefix: string): Promise<{
  workspaceA: WorkspaceRow;
  sessionA: SessionRow;
  stamp: number;
}> {
  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `${titlePrefix} ${stamp}`);
  return { workspaceA, sessionA, stamp };
}

export function writeAuditJson(name: string, value: unknown): void {
  writeFileSync(resolve(auditDir, name), JSON.stringify(value, null, 2));
}

export async function seedRegistry(
  page: Page,
  currentId = 'overnight:a',
  options: { previewRailOpen?: boolean } = {},
): Promise<void> {
  const [capsA, capsB] = await Promise.all([
    api<Record<string, unknown>>(BACKEND_A, '/v1/capabilities'),
    api<Record<string, unknown>>(BACKEND_B, '/v1/capabilities'),
  ]);
  await page.addInitScript(
    ({ backendA, backendB, capsASeed, capsBSeed, currentIdSeed, previewRailOpenSeed }) => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
      window.localStorage.setItem('clio.selected-workspace.v1', '__all');
      window.localStorage.setItem('clio.preview-rail-open.v1', previewRailOpenSeed ? 'true' : 'false');
      window.localStorage.setItem('clio.inspector-open.v1', 'false');
      window.localStorage.setItem(
        'clio.backends.v1',
        JSON.stringify({
          backends: [
            {
              id: 'overnight:a',
              label: 'Overnight A',
              url: backendA,
              bearerToken: '',
              kind: 'http',
              capabilities: capsASeed,
            },
            {
              id: 'overnight:b',
              label: 'Overnight B',
              url: backendB,
              bearerToken: '',
              kind: 'http',
              capabilities: capsBSeed,
            },
          ],
          currentId: currentIdSeed,
        }),
      );
    },
    {
      backendA: BACKEND_A,
      backendB: BACKEND_B,
      capsASeed: capsA,
      capsBSeed: capsB,
      currentIdSeed: currentId,
      previewRailOpenSeed: options.previewRailOpen ?? true,
    },
  );
}

export async function allowBackendCors(page: Page): Promise<void> {
  if (process.env['CLIO_PLAYWRIGHT_CORS_SHIM'] !== '1') return;
  await page.route('**/v1/**', async (route) => {
    if (route.request().url().includes('/events')) {
      await route.continue();
      return;
    }
    const resp = await route.fetch();
    await route.fulfill({
      response: resp,
      headers: { ...resp.headers(), 'access-control-allow-origin': '*' },
    });
  });
}

export async function openBrowser(): Promise<{ browser: Browser; ctx: BrowserContext; page: Page }> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return { browser, ctx, page };
}

export async function openSeededChat(page: Page, backend = BACKEND_A): Promise<void> {
  await seedRegistry(page);
  await allowBackendCors(page);
  await page.goto(`/?route=chat&backend=${encodeURIComponent(backend)}`);
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
}
