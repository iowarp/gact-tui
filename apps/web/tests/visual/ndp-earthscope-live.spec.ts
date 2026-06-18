/**
 * Opt-in live benchmark gate: web app -> real CLIO -> marketplace
 * earthscope-gnss-region blueprint -> NDP/EarthScope prompt from
 * clio-agent's real-case acceptance test.
 *
 * This is deliberately not part of the default visual suite. It stages
 * real data, can take many minutes, and depends on a configured live
 * provider/backend.
 *
 * Run:
 *   CLIO_NDP_EARTHSCOPE_LIVE=1 \
 *   CLIO_GACT_URL=http://127.0.0.1:17960 \
 *   pnpm test:visual --grep "EarthScope marketplace"
 */

import { test, expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EARTHSCOPE_GNSS_REGION_BLUEPRINT,
  EARTHSCOPE_GNSS_REGION_EXPECT,
  EARTHSCOPE_GNSS_REGION_PROMPT,
} from './live-prompts.js';

const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17801';
const ENABLED = process.env['CLIO_NDP_EARTHSCOPE_LIVE'] === '1';
const KEEP_LIVE_SESSIONS = process.env['CLIO_LIVE_KEEP_SESSIONS'] === '1';
const MARKETPLACE_SOURCE =
  process.env['CLIO_MARKETPLACE_SOURCE'] ??
  process.env['CLIO_AGENT_MARKETPLACE_SOURCE'] ??
  '/home/jcernuda/clio-agent/external/clio-agent-marketplace';
const BLUEPRINT_INSTALL_SCOPE =
  process.env['CLIO_NDP_EARTHSCOPE_BLUEPRINT_SCOPE'] === 'workspace' ? 'workspace' : 'global';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const GENERATED_WORKSPACE_PARENT = resolve(REPO_ROOT, 'tmp');
mkdirSync(GENERATED_WORKSPACE_PARENT, { recursive: true });
const EXPLICIT_WORKSPACE_ROOT = process.env['CLIO_NDP_EARTHSCOPE_WORKSPACE'];
const WORKSPACE_ROOT =
  EXPLICIT_WORKSPACE_ROOT ??
  mkdtempSync(resolve(GENERATED_WORKSPACE_PARENT, 'ndp-earthscope-live-'));
const TRACE_ROOT =
  process.env['CLIO_SEMANTIC_TRACE_PATH'] ??
  resolve(WORKSPACE_ROOT, '..', 'traces');
const LOCAL_CLIO_KIT_PATH =
  process.env['CLIO_KIT_PATH'] ?? '/home/jcernuda/clio-kit';
const USE_LOCAL_MCP_OVERRIDE =
  process.env['CLIO_NDP_EARTHSCOPE_LOCAL_MCP'] !== '0' &&
  existsSync(LOCAL_CLIO_KIT_PATH);

const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

interface Workspace {
  id: string;
  name?: string;
  root_path?: string;
}

interface SessionRow {
  id: string;
  title?: string;
  workspace_id?: string;
}

interface Message {
  role?: string;
  stop_reason?: string;
  error_info?: unknown;
  parts?: Array<{ type?: string; text?: string; metadata?: Record<string, unknown> }>;
  metadata?: Record<string, unknown>;
}

interface PermissionRow {
  id: string;
  status?: string;
  tool_call?: {
    tool_name?: string;
    input?: Record<string, unknown>;
  };
}

interface ApprovedPermissionEvidence extends PermissionRow {
  approved_at: string;
  initial_status?: string;
  resolved_status?: string;
  screenshot: string;
}

interface ArtifactPreviewEvidence {
  path: string;
  screenshot: string;
  outcome: 'image' | 'diagnostic';
  naturalWidth: number;
  naturalHeight: number;
}

let reachable = false;
try {
  const r = await fetch(`${BACKEND}/v1/capabilities`, {
    signal: AbortSignal.timeout(2000),
  });
  reachable = r.ok;
} catch {
  reachable = false;
}

function shot(slug: string): string {
  return resolve(auditDir, `${slug}.png`);
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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

async function optionalApi<T>(path: string, init: RequestInit = {}): Promise<T | { error: string }> {
  try {
    return await api<T>(path, init);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function ensureWorkspace(): Promise<string> {
  ensureWorkspaceMcpOverride();
  const rows = (await api<{ workspaces: Workspace[] }>('/v1/workspaces')).workspaces ?? [];
  const existing = rows.find((w) => w.root_path === WORKSPACE_ROOT);
  if (existing?.id) return existing.id;
  const created = await api<Workspace>('/v1/workspaces', {
    method: 'POST',
    body: JSON.stringify({
      name: 'ndp-earthscope-live',
      root_path: WORKSPACE_ROOT,
      storage_root: `${WORKSPACE_ROOT}/.clio`,
    }),
  });
  return created.id;
}

function ensureWorkspaceMcpOverride(): void {
  if (!USE_LOCAL_MCP_OVERRIDE) return;
  mkdirSync(WORKSPACE_ROOT, { recursive: true });
  const storageRoot = resolve(WORKSPACE_ROOT, '.clio');
  mkdirSync(storageRoot, { recursive: true });
  writeFileSync(
    resolve(storageRoot, 'mcp.yaml'),
    [
      'mcp_servers:',
      `  ndp: uv run --directory ${LOCAL_CLIO_KIT_PATH}/clio-kit-mcp-servers/ndp ndp-mcp`,
      `  geo: uv run --directory ${LOCAL_CLIO_KIT_PATH}/clio-kit-mcp-servers/geo geo-mcp`,
      `  pandas: uv run --directory ${LOCAL_CLIO_KIT_PATH}/clio-kit-mcp-servers/pandas pandas-mcp`,
      `  plot: uv run --directory ${LOCAL_CLIO_KIT_PATH}/clio-kit-mcp-servers/plot plot-mcp`,
      '',
    ].join('\n'),
  );
}

async function blueprintInstalled(workspaceId: string): Promise<boolean> {
  const path =
    BLUEPRINT_INSTALL_SCOPE === 'workspace'
      ? `/v1/agent-blueprints?workspace_id=${encodeURIComponent(workspaceId)}`
      : '/v1/agent-blueprints';
  const raw = await api<Record<string, unknown>>(path);
  const rows = ((raw['agent_blueprints'] as Array<Record<string, unknown>> | undefined) ??
    (raw['blueprints'] as Array<Record<string, unknown>> | undefined) ??
    []);
  return rows.some((row) => row['id'] === EARTHSCOPE_GNSS_REGION_BLUEPRINT);
}

async function ensureMarketplaceBlueprint(workspaceId: string): Promise<void> {
  if (await blueprintInstalled(workspaceId)) return;
  await api('/v1/agent-blueprints/install', {
    method: 'POST',
    body: JSON.stringify({
      source: MARKETPLACE_SOURCE,
      scope: BLUEPRINT_INSTALL_SCOPE,
      ...(BLUEPRINT_INSTALL_SCOPE === 'workspace' ? { workspace_id: workspaceId } : {}),
      blueprint_id: EARTHSCOPE_GNSS_REGION_BLUEPRINT,
    }),
  });
  if (!(await blueprintInstalled(workspaceId))) {
    throw new Error(`blueprint ${EARTHSCOPE_GNSS_REGION_BLUEPRINT} did not appear after install`);
  }
}

async function bindBlueprint(sessionId: string): Promise<void> {
  await api(`/v1/sessions/${encodeURIComponent(sessionId)}/agent-blueprint`, {
    method: 'POST',
    body: JSON.stringify({ blueprint_id: EARTHSCOPE_GNSS_REGION_BLUEPRINT }),
  });
}

async function archiveSession(sessionId: string): Promise<void> {
  if (KEEP_LIVE_SESSIONS) return;
  await optionalApi(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived: true }),
  });
}

async function bootBrowser(): Promise<Browser> {
  return await chromium.launch({ args: ['--disable-web-security'] });
}

async function openConnected(browser: Browser): Promise<{
  ctx: BrowserContext;
  page: Page;
}> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');
    window.localStorage.setItem('clio.selected-workspace.v1', '__all');
    window.localStorage.setItem('clio.preview-rail-open.v1', 'false');
  });
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

async function selectWorkspace(page: Page): Promise<void> {
  await page.getByTestId('workspace-switcher').locator('button').first().click();
  const option = page.getByRole('option').filter({ hasText: WORKSPACE_ROOT });
  await expect(option).toHaveCount(1, { timeout: 10_000 });
  await option.click();
  await page.waitForTimeout(500);
}

async function createBackendSession(workspaceId: string): Promise<string> {
  const created = await api<SessionRow>('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      title: `ndp earthscope live ${Date.now()}`,
      workspace_id: workspaceId,
    }),
  });
  if (!created.id) throw new Error('backend-created session returned no id');
  return created.id;
}

async function selectSession(page: Page, sessionId: string): Promise<void> {
  const row = page.getByTestId(`session-row-${sessionId}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.getByTestId('transcript-pane')).toBeVisible();
}

async function openPreviewRail(page: Page): Promise<void> {
  if ((await page.getByTestId('preview-rail').count()) === 0) {
    await page.getByTestId('topbar-preview').click();
  }
  await expect(page.getByTestId('preview-rail')).toBeVisible({ timeout: 10_000 });
}

async function previewPath(page: Page, path: string): Promise<void> {
  await openPreviewRail(page);
  await page.getByTestId('preview-rail-refresh').click();
  await page.getByTestId('preview-rail-filter').fill(path);
  const row = page.getByTestId(`preview-rail-row-${path}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
}

async function waitForImagePreviewOutcome(page: Page): Promise<'image' | 'diagnostic'> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const rendered = await page.getByTestId('preview-rail-image').locator('img').count();
    if (rendered > 0) return 'image';
    const diagnostic = await page.getByTestId('preview-rail-image-error').count();
    if (diagnostic > 0) return 'diagnostic';
    await page.waitForTimeout(250);
  }
  throw new Error('image preview neither rendered nor showed a diagnostic');
}

async function sendPrompt(page: Page): Promise<void> {
  const composer = page.getByTestId('composer-input');
  await composer.click();
  await composer.fill(`${EARTHSCOPE_GNSS_REGION_PROMPT}\n\nLive gate nonce: ${Date.now()}`);
  await page.getByTestId('composer-send').click();
}

function textFromMessages(messages: Message[]): string {
  return messages
    .flatMap((message) => message.parts ?? [])
    .map((part) => part.text ?? '')
    .join('\n');
}

function listWorkspaceArtifacts(): Array<{ path: string; size_bytes: number }> {
  try {
    return readdirSync(WORKSPACE_ROOT)
      .map((name) => {
        const path = resolve(WORKSPACE_ROOT, name);
        const st = statSync(path);
        return st.isFile() ? { path: name, size_bytes: st.size } : null;
      })
      .filter((row): row is { path: string; size_bytes: number } => !!row)
      .sort((a, b) => a.path.localeCompare(b.path));
  } catch {
    return [];
  }
}

function generatedPngArtifact(): { path: string; size_bytes: number } | undefined {
  return listWorkspaceArtifacts()
    .filter((artifact) => artifact.path.toLowerCase().endsWith('.png') && artifact.size_bytes > 0)
    .sort((a, b) => b.size_bytes - a.size_bytes)[0];
}

async function captureGeneratedArtifactPreview(page: Page): Promise<ArtifactPreviewEvidence> {
  const artifact = generatedPngArtifact();
  if (!artifact) {
    throw new Error('EarthScope workflow did not produce a non-empty PNG artifact');
  }
  await previewPath(page, artifact.path);
  const outcome = await waitForImagePreviewOutcome(page);
  let naturalWidth = 0;
  let naturalHeight = 0;
  if (outcome === 'image') {
    const img = page.getByTestId('preview-rail-image').locator('img');
    await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/);
    naturalWidth = await img.evaluate((node) => (node as HTMLImageElement).naturalWidth);
    naturalHeight = await img.evaluate((node) => (node as HTMLImageElement).naturalHeight);
    expect(naturalWidth).toBeGreaterThan(0);
    expect(naturalHeight).toBeGreaterThan(0);
  } else {
    await expect(page.getByTestId('preview-rail-image-error')).toContainText(/backend|image|bytes/i);
  }
  const screenshot = shot('ndp-earthscope-live-artifact-preview');
  await page.screenshot({ path: screenshot, fullPage: false });
  return {
    path: artifact.path,
    screenshot,
    outcome,
    naturalWidth,
    naturalHeight,
  };
}

function semanticTraceTail(sessionId: string, maxLines = 160): string[] {
  const path = resolve(TRACE_ROOT, `${sessionId}.semantic.jsonl`);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trimEnd().split('\n').slice(-maxLines);
}

function repeatedDelegationLoop(sessionId: string): string | undefined {
  const tail = semanticTraceTail(sessionId, 80);
  const counts = new Map<string, number>();
  for (const line of tail) {
    try {
      const event = JSON.parse(line) as {
        event_type?: string;
        summary?: string;
        blueprint?: { child_expert?: string; parent_expert?: string };
        actor?: { agent_id?: string };
      };
      if (event.event_type !== 'blueprint.delegation.started') continue;
      const parent =
        event.blueprint?.parent_expert ??
        event.actor?.agent_id ??
        event.summary?.match(/^(\S+) delegated/)?.[1] ??
        'unknown';
      const child =
        event.blueprint?.child_expert ??
        event.summary?.match(/to (\S+)\.?$/)?.[1] ??
        'unknown';
      const key = `${parent} -> ${child}`;
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      if (next >= 3) {
        return `${key} repeated ${next} times`;
      }
    } catch {
      // Ignore partial trace lines while CLIO is writing.
    }
  }
  return undefined;
}

async function collectEvidence(
  sessionId: string,
  workspaceId: string,
  approvedPermissions: ApprovedPermissionEvidence[],
  messages?: Message[],
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const [permissions, session, activeBlueprint, installedBlueprints, messageRows] =
    await Promise.all([
      optionalApi<Record<string, unknown>>(
        `/v1/permissions?session_id=${encodeURIComponent(sessionId)}`,
      ),
      optionalApi<Record<string, unknown>>(`/v1/sessions/${encodeURIComponent(sessionId)}`),
      optionalApi<Record<string, unknown>>(
        `/v1/sessions/${encodeURIComponent(sessionId)}/agent-blueprint`,
      ),
      optionalApi<Record<string, unknown>>(
        `/v1/agent-blueprints?workspace_id=${encodeURIComponent(workspaceId)}`,
      ),
      messages
        ? Promise.resolve({ messages })
        : optionalApi<{ messages: Message[] }>(
            `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
          ),
    ]);

  return {
    backend: BACKEND,
    marketplaceSource: MARKETPLACE_SOURCE,
    blueprintInstallScope: BLUEPRINT_INSTALL_SCOPE,
    workspaceRoot: WORKSPACE_ROOT,
    workspaceRootWasExplicit: !!EXPLICIT_WORKSPACE_ROOT,
    localMcpOverride: USE_LOCAL_MCP_OVERRIDE
      ? resolve(WORKSPACE_ROOT, '.clio', 'mcp.yaml')
      : null,
    workspaceId,
    sessionId,
    permissions,
    approvedPermissions,
    session,
    activeBlueprint,
    installedBlueprints,
    workspaceArtifacts: listWorkspaceArtifacts(),
    semanticTraceTail: semanticTraceTail(sessionId),
    messages: 'error' in messageRows ? messageRows : messageRows.messages,
    ...extra,
  };
}

async function writeEvidence(
  sessionId: string,
  workspaceId: string,
  approvedPermissions: ApprovedPermissionEvidence[],
  messages?: Message[],
  failure?: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const evidence = await collectEvidence(sessionId, workspaceId, approvedPermissions, messages, extra);
  writeFileSync(
    resolve(auditDir, 'ndp-earthscope-live-evidence.json'),
    JSON.stringify({ ...evidence, failure }, null, 2),
  );
}

function permissionLabel(row: PermissionRow): string {
  const tool = row.tool_call?.tool_name ?? 'permission';
  const input = row.tool_call?.input ?? {};
  const command =
    typeof input['command'] === 'string'
      ? input['command']
      : typeof input['cmd'] === 'string'
        ? input['cmd']
        : '';
  const suffix = command.toLowerCase().includes('cleanup') ? 'cleanup' : '';
  return [tool, suffix].filter(Boolean).join('-').replace(/[^a-zA-Z0-9_-]+/g, '-');
}

async function permissionStatus(sessionId: string, permissionId: string): Promise<string | undefined> {
  const raw = await optionalApi<{ permissions: PermissionRow[] }>(
    `/v1/permissions?session_id=${encodeURIComponent(sessionId)}`,
  );
  if ('error' in raw) return undefined;
  return (raw.permissions ?? []).find((p) => p.id === permissionId)?.status;
}

async function waitForPermissionResolution(
  sessionId: string,
  permissionId: string,
): Promise<string | undefined> {
  const deadline = Date.now() + 20_000;
  let latest: string | undefined;
  while (Date.now() < deadline) {
    latest = await permissionStatus(sessionId, permissionId);
    if (latest && latest !== 'pending') return latest;
    await new Promise((resolveTick) => setTimeout(resolveTick, 400));
  }
  return latest;
}

async function approvePendingPermissionsThroughUi(
  page: Page,
  sessionId: string,
  approved: ApprovedPermissionEvidence[],
): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const raw = await optionalApi<{ permissions: PermissionRow[] }>(
      `/v1/permissions?session_id=${encodeURIComponent(sessionId)}`,
    );
    if ('error' in raw) return;
    const pending = (raw.permissions ?? []).find(
      (p) => p.status === 'pending' && !approved.some((approvedRow) => approvedRow.id === p.id),
    );
    if (!pending) return;

    const screenshot = shot(
      `ndp-earthscope-live-permission-${approved.length + 1}-${permissionLabel(pending)}`,
    );
    const card = page.getByTestId('permission-card');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: screenshot, fullPage: false });
    await page.getByTestId('permcard-allow-once').click();
    await expect(card).toBeHidden({ timeout: 20_000 });
    const resolvedStatus = await waitForPermissionResolution(sessionId, pending.id);
    approved.push({
      ...pending,
      initial_status: pending.status,
      status: resolvedStatus ?? pending.status,
      resolved_status: resolvedStatus,
      approved_at: new Date().toISOString(),
      screenshot,
    });
    await page.waitForTimeout(400);
  }
}

async function waitForTerminalAssistant(
  page: Page,
  sessionId: string,
  approvedPermissions: ApprovedPermissionEvidence[],
): Promise<Message[]> {
  const deadline = Date.now() + 30 * 60 * 1000;
  let last: Message[] = [];
  while (Date.now() < deadline) {
    await approvePendingPermissionsThroughUi(page, sessionId, approvedPermissions);
    const raw = await api<{ messages: Message[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
    );
    last = raw.messages ?? [];
    await approvePendingPermissionsThroughUi(page, sessionId, approvedPermissions);
    const assistant = last.find(
      (message) => message.role === 'assistant' && (message.stop_reason || message.error_info),
    );
    if (assistant) return last;
    const loop = repeatedDelegationLoop(sessionId);
    if (loop) {
      throw new Error(`EarthScope workflow appears stuck in repeated delegation: ${loop}`);
    }
    await new Promise((resolveTick) => setTimeout(resolveTick, 2500));
  }
  throw new Error(`EarthScope turn did not finish within 30 minutes; last=${JSON.stringify(last).slice(0, 2000)}`);
}

test.setTimeout(32 * 60 * 1000);

test('EarthScope marketplace blueprint drives the real NDP GNSS benchmark prompt', async () => {
  test.skip(!ENABLED, 'set CLIO_NDP_EARTHSCOPE_LIVE=1 to run the real NDP/EarthScope gate');
  test.skip(!reachable, `no live clio backend reachable at ${BACKEND}`);

  const workspaceId = await ensureWorkspace();
  await ensureMarketplaceBlueprint(workspaceId);

  const browser = await bootBrowser();
  let ctx: BrowserContext | undefined;
  try {
    const sessionId = await createBackendSession(workspaceId);
    await bindBlueprint(sessionId);
    const opened = await openConnected(browser);
    ctx = opened.ctx;
    const page = opened.page;
    await selectWorkspace(page);
    await selectSession(page, sessionId);

    await sendPrompt(page);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: shot('ndp-earthscope-live-early'), fullPage: false });

    const approvedPermissions: ApprovedPermissionEvidence[] = [];
    let messages: Message[] = [];
    try {
      messages = await waitForTerminalAssistant(page, sessionId, approvedPermissions);
    } catch (err) {
      await page.screenshot({ path: shot('ndp-earthscope-live-settled'), fullPage: false });
      await writeEvidence(
        sessionId,
        workspaceId,
        approvedPermissions,
        undefined,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
    await page.screenshot({ path: shot('ndp-earthscope-live-settled'), fullPage: false });
    const raw = JSON.stringify(messages);
    const text = textFromMessages(messages);
    const assistant = messages.find(
      (message) => message.role === 'assistant' && (message.stop_reason || message.error_info),
    );
    await writeEvidence(sessionId, workspaceId, approvedPermissions, messages);

    expect(assistant?.error_info ?? null, raw.slice(0, 4000)).toBeNull();
    expect(text, 'assistant transcript should mention EarthScope/GNSS evidence').toMatch(
      EARTHSCOPE_GNSS_REGION_EXPECT,
    );
    expect(raw, 'trace should show NDP staging').toContain('ndp_stage_resource');
    expect(raw, 'trace should show region filtering').toContain('geo_filter_points_by_radius');
    expect(raw, 'trace should show CSV profiling').toContain('pandas_profile_csv');
    expect(raw, 'trace should show a rendered PNG artifact').toMatch(/\.png/);

    await expect(page.getByTestId('transcript-pane')).toContainText(
      EARTHSCOPE_GNSS_REGION_EXPECT,
      { timeout: 30_000 },
    );
    const artifactPreview = await captureGeneratedArtifactPreview(page);
    await writeEvidence(sessionId, workspaceId, approvedPermissions, messages, undefined, {
      artifactPreview,
      archivedAfterEvidence: !KEEP_LIVE_SESSIONS,
    });
    await page.screenshot({ path: shot('ndp-earthscope-live-final'), fullPage: false });
    await archiveSession(sessionId);
  } finally {
    await ctx?.close();
    await browser.close();
  }
});
