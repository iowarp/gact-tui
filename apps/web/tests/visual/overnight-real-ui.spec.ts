/**
 * Opt-in overnight real-system UI validation:
 *
 *   web app -> isolated live CLIO backend -> real workspace files ->
 *   preview rail + real agent turn.
 *
 * This is not a default CI gate. It is meant for long burn-in runs where
 * screenshots and backend traces are evidence.
 *
 * Run:
 *   CLIO_OVERNIGHT_REAL_UI=1 \
 *   CLIO_GACT_URL=http://127.0.0.1:18089 \
 *   CLIO_OVERNIGHT_WORKSPACE_ID=ws_... \
 *   pnpm test:visual --grep "overnight real UI"
 */

import { test, expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:18089';
const ENABLED = process.env['CLIO_OVERNIGHT_REAL_UI'] === '1';
const WORKSPACE_ID = process.env['CLIO_OVERNIGHT_WORKSPACE_ID'] ?? '';

const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

interface SessionRow {
  id: string;
  title?: string;
  workspace_id?: string;
}

interface Message {
  id?: string;
  role?: string;
  stop_reason?: string;
  error_info?: unknown;
  parts?: Array<{ type?: string; text?: string; path?: string; unified_diff?: string }>;
  metadata?: Record<string, unknown>;
}

let reachable = false;
try {
  const r = await fetch(`${BACKEND}/v1/capabilities`, {
    signal: AbortSignal.timeout(2_000),
  });
  reachable = r.ok || r.status === 503;
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

async function ensureWorkspaceId(): Promise<string> {
  if (WORKSPACE_ID) return WORKSPACE_ID;
  const rows = (await api<{ workspaces: Array<{ id: string; name?: string }> }>('/v1/workspaces')).workspaces;
  const found = rows.find((row) => row.name === 'overnight-real-ui') ?? rows[0];
  if (!found?.id) throw new Error('No workspace available for overnight real UI proof');
  return found.id;
}

async function workspaceRoot(workspaceId: string): Promise<string> {
  const rows = (await api<{ workspaces: Array<{ id: string; root_path?: string }> }>('/v1/workspaces')).workspaces;
  const found = rows.find((row) => row.id === workspaceId);
  if (!found?.root_path) throw new Error(`workspace ${workspaceId} has no root_path`);
  return found.root_path;
}

async function createSession(
  workspaceId: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const created = await api<SessionRow>('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      title: 'overnight real UI evidence',
      workspace_id: workspaceId,
      ...extra,
    }),
  });
  return created.id;
}

async function ensureFileEditorAgent(): Promise<string> {
  const id = `file_editor_${Date.now()}`;
  await api('/v1/agents', {
    method: 'POST',
    body: JSON.stringify({
      id,
      title: 'File Editor Evidence Agent',
      description: 'Reads workspace files and proposes diffs for validation.',
      system_prompt: [
        'You are a focused file editing agent.',
        'Use fs_read_file to inspect files and fs_propose_edit to propose non-destructive unified diffs.',
        'Never claim a diff was created unless fs_propose_edit returns one.',
      ].join(' '),
      tools: ['fs_read_file', 'fs_propose_edit'],
      tier: 1,
      specialization: 'file_editing',
      keywords: ['files', 'diffs', 'editing'],
    }),
  });
  return id;
}

async function deleteAgent(agentId: string): Promise<void> {
  try {
    await api(`/v1/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
  } catch {
    // Best-effort cleanup only; older or partially configured backends may not
    // support deleting ad-hoc validation agents.
  }
}

async function attachContextFile(sessionId: string, workspaceId: string, path: string, mode = 'read'): Promise<void> {
  await api(`/v1/sessions/${encodeURIComponent(sessionId)}/context/files`, {
    method: 'POST',
    body: JSON.stringify({ path, mode, workspace_id: workspaceId }),
  });
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
    window.localStorage.setItem('clio.preview-rail-open.v1', 'true');
    window.localStorage.setItem('clio.inspector-open.v1', 'false');
  });
  if (process.env['CLIO_PLAYWRIGHT_CORS_SHIM'] === '1') {
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
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  return { ctx, page };
}

async function selectSession(page: Page, sessionId: string): Promise<void> {
  const row = page.getByTestId(`session-row-${sessionId}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.getByTestId('transcript-pane')).toBeVisible();
}

async function previewFile(page: Page, filePath: string, expectedText: string, slug: string): Promise<void> {
  const rail = page.getByTestId('preview-rail');
  await expect(rail).toBeVisible({ timeout: 8_000 });
  await page.getByTestId('preview-rail-filter').fill(filePath);
  const row = page.getByTestId(`preview-rail-row-${filePath}`);
  await expect(row).toBeVisible({ timeout: 8_000 });
  await row.click();
  const text =
    filePath.toLowerCase().endsWith('.md')
      ? page.getByTestId('preview-rail-markdown')
      : page.getByTestId('preview-rail-text');
  await expect(text).toBeVisible({ timeout: 8_000 });
  await expect(text).toContainText(expectedText, { timeout: 8_000 });
  await page.screenshot({ path: shot(slug), fullPage: false });
}

async function previewImage(page: Page, filePath: string, slug: string): Promise<void> {
  await page.getByTestId('preview-rail-filter').fill(filePath);
  const row = page.getByTestId(`preview-rail-row-${filePath}`);
  await expect(row).toBeVisible({ timeout: 8_000 });
  await row.click();
  await expect
    .poll(
      async () => {
        const rendered = await page.getByTestId('preview-rail-image').locator('img').count();
        if (rendered > 0) return 'image';
        const diagnostic = await page.getByTestId('preview-rail-image-error').count();
        if (diagnostic > 0) return 'diagnostic';
        return 'pending';
      },
      { timeout: 8_000 },
    )
    .not.toBe('pending');
  const img = page.getByTestId('preview-rail-image').locator('img');
  if ((await img.count()) > 0) {
    await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/);
    await expect
      .poll(async () => img.evaluate((node) => (node as HTMLImageElement).naturalWidth), {
        timeout: 3_000,
        message: `${filePath} should decode as a real image artifact`,
      })
      .toBeGreaterThan(0);
  } else {
    await expect(page.getByTestId('preview-rail-image-error')).toContainText(/backend|image|bytes/i);
  }
  await page.screenshot({ path: shot(slug), fullPage: false });
}

async function sendPrompt(page: Page, prompt: string): Promise<void> {
  const composer = page.getByTestId('composer-input');
  await composer.click();
  await composer.fill(prompt);
  await page.getByTestId('composer-send').click();
}

async function waitForAssistant(sessionId: string): Promise<Message[]> {
  const deadline = Date.now() + 12 * 60 * 1000;
  let last: Message[] = [];
  while (Date.now() < deadline) {
    const raw = await api<{ messages: Message[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
    );
    last = raw.messages ?? [];
    if (last.some((msg) => msg.role === 'assistant' && (msg.stop_reason || msg.error_info))) {
      return last;
    }
    await new Promise((resolveTick) => setTimeout(resolveTick, 2_000));
  }
  throw new Error(`agent turn did not finish; last=${JSON.stringify(last).slice(0, 1000)}`);
}

async function pendingDiffs(sessionId: string): Promise<Array<{ path?: string; unified_diff?: string }>> {
  const raw = await api<{ diffs?: Array<{ path?: string; unified_diff?: string }> }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/diffs`,
  );
  return raw.diffs ?? [];
}

test.setTimeout(15 * 60 * 1000);

test('overnight real UI renders workspace files and captures a live agent turn', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no CLIO backend reachable at ${BACKEND}`);

  const workspaceId = await ensureWorkspaceId();
  const sessionId = await createSession(workspaceId);
  await attachContextFile(sessionId, workspaceId, 'README.md');
  await attachContextFile(sessionId, workspaceId, 'sample_metrics.csv');
  await attachContextFile(sessionId, workspaceId, 'handlers.go', 'edit');

  const browser = await chromium.launch();
  const { ctx, page } = await openConnected(browser);
  await selectSession(page, sessionId);

  await previewFile(page, 'README.md', 'Evidence Checklist', 'overnight-real-markdown-preview');
  await previewFile(page, 'handlers.go', 'fmt.Println', 'overnight-real-code-preview');
  await previewImage(page, 'validation_plot.png', 'overnight-real-image-preview');

  await sendPrompt(
    page,
    [
      'Use the attached README.md and sample_metrics.csv from this workspace.',
      'Summarize the evidence checklist, inspect the CSV columns if your tools support it,',
      'and propose a small edit to handlers.go that replaces fmt.Println with structured logging.',
      'If a required tool is unavailable, report the exact blocker instead of pretending success.',
    ].join(' '),
  );
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: shot('overnight-real-agent-turn-early'), fullPage: false });

  const messages = await waitForAssistant(sessionId);
  writeFileSync(
    resolve(auditDir, 'overnight-real-agent-messages.json'),
    JSON.stringify({ backend: BACKEND, workspaceId, sessionId, messages }, null, 2),
  );
  await page.screenshot({ path: shot('overnight-real-agent-turn-settled'), fullPage: false });

  await expect(page.getByTestId('transcript-pane')).toContainText(/checklist|blocker|csv|handlers/i, {
    timeout: 10_000,
  });

  await ctx.close();
  await browser.close();
});

test('overnight real UI shows metadata tool evidence for a live file-edit agent', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no CLIO backend reachable at ${BACKEND}`);

  const workspaceId = await ensureWorkspaceId();
  const root = await workspaceRoot(workspaceId);
  const agentId = await ensureFileEditorAgent();
  const sessionId = await createSession(workspaceId, {
    title: 'overnight file editor diff proof',
    mode: 'edit',
    edit_mode: 'patch',
    routing_mode: 'chat',
    agent: { id: agentId },
  });
  await attachContextFile(sessionId, workspaceId, 'README.md');
  await attachContextFile(sessionId, workspaceId, 'sample_metrics.csv');
  await attachContextFile(sessionId, workspaceId, 'handlers.go', 'edit');

  const browser = await chromium.launch();
  const { ctx, page } = await openConnected(browser);
  try {
    await selectSession(page, sessionId);

    await sendPrompt(
      page,
      [
        `Use fs_read_file to read ${root}/handlers.go,`,
        'then use fs_propose_edit for that same filepath.',
        'Change both existing fmt.Println calls to log.Printf("processed=%s", id), and add the log import if needed.',
        'Return a concise explanation after the tool call.',
      ].join(' '),
    );
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: shot('overnight-real-file-editor-early'), fullPage: false });

    const messages = await waitForAssistant(sessionId);
    const diffs = await pendingDiffs(sessionId);
    const assistant = messages.find((msg) => msg.role === 'assistant');
    const fileDiffParts = (assistant?.parts ?? []).filter((part) => part.type === 'file_diff');
    writeFileSync(
      resolve(auditDir, 'overnight-real-file-editor-messages.json'),
      JSON.stringify({ backend: BACKEND, workspaceId, sessionId, agentId, diffs, messages }, null, 2),
    );

    await page.getByTestId('topbar-inspector').click();
    await expect(page.getByTestId('inspector-drawer')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('inspector-tab-tools').click();
    await expect(page.getByTestId('inspector-drawer')).toContainText('fs_read_file', { timeout: 8_000 });
    await expect(page.getByTestId('inspector-drawer')).toContainText('fs_propose_edit', { timeout: 8_000 });
    await page.screenshot({ path: shot('overnight-real-file-editor-tools'), fullPage: false });

    const diffChip = page.getByTestId('filediff-chip').first();
    if (fileDiffParts.length > 0 || diffs.length > 0 || (await diffChip.count()) > 0) {
      await expect(page.getByTestId('filediff-chip').first()).toBeVisible({ timeout: 8_000 });
      await page.getByTestId('filediff-chip').first().click();
      await expect(page.getByTestId('diff-pane')).toBeVisible({ timeout: 8_000 });
      await page.screenshot({ path: shot('overnight-real-file-editor-diff'), fullPage: false });
    } else {
      await expect(page.getByTestId('transcript-pane')).toContainText(/log\.Printf|updated|proposed|diff/i, {
        timeout: 8_000,
      });
      await page.screenshot({ path: shot('overnight-real-file-editor-diff-blocked'), fullPage: false });
    }
  } finally {
    await ctx.close();
    await browser.close();
    await deleteAgent(agentId);
  }
});
