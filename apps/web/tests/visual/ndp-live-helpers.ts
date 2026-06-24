import { chromium, type Browser } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17801';
export const KEEP_LIVE_SESSIONS = process.env['CLIO_LIVE_KEEP_SESSIONS'] === '1';

export const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

export interface Workspace {
  id: string;
  name?: string;
  root_path?: string;
}

export interface SessionRow {
  id: string;
  title?: string;
  workspace_id?: string;
  archived?: boolean;
}

export interface WorkspaceFileEntry {
  path: string;
  type?: string;
  size?: number;
}

export let reachable = false;
try {
  const r = await fetch(`${BACKEND}/v1/capabilities`, {
    signal: AbortSignal.timeout(2000),
  });
  reachable = r.ok;
} catch {
  reachable = false;
}

export function shot(slug: string): string {
  return resolve(auditDir, `${slug}.png`);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BACKEND}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${init.method ?? 'GET'} ${path} failed: ${r.status} ${body}`);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export async function optionalApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | { error: string }> {
  try {
    return await api<T>(path, init);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function bootBrowser(): Promise<Browser> {
  return await chromium.launch({ args: ['--disable-web-security'] });
}

export async function archiveSession(
  sessionId: string,
): Promise<SessionRow | { error: string } | { kept: true }> {
  if (KEEP_LIVE_SESSIONS) return { kept: true };
  return await optionalApi<SessionRow>(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived: true }),
  });
}
