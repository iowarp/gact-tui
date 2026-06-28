/**
 * Opt-in real-system transcript rendering validation:
 *
 *   production web app -> isolated live CLIO backend -> real model response ->
 *   markdown table/list/code rendering in the transcript.
 *
 * This is not a default CI gate. It is for burn-in runs where screenshots and
 * backend messages are evidence that real CLIO output remains readable.
 */

import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BACKEND,
  ENABLED,
  WORKSPACE_ID,
  api,
  auditDir,
  bootBrowser,
  createAgentSession,
  deleteAgent,
  openConnected,
  reachable,
  selectSession,
  sendPrompt,
  shot,
} from './overnight-single-backend-helpers';

interface Message {
  id?: string;
  role?: string;
  stop_reason?: string;
  error_info?: unknown;
  parts?: Array<{ type?: string; text?: string }>;
}

async function ensureMarkdownAgent(): Promise<string> {
  const id = `markdown_probe_${Date.now()}`;
  await api('/v1/agents', {
    method: 'POST',
    body: JSON.stringify({
      id,
      title: 'Markdown Rendering Probe Agent',
      description: 'Answers directly in markdown so transcript rendering can be validated.',
      system_prompt: [
        'You are a direct conversational agent used for UI rendering validation.',
        'Answer ordinary writing requests directly in markdown.',
        'Do not ask for tools or child experts.',
        'Do not refuse formatting-only requests.',
      ].join(' '),
      tools: [],
      tier: 1,
      specialization: 'rendering_validation',
      keywords: ['markdown', 'rendering', 'validation'],
    }),
  });
  return id;
}

async function createSession(agentId: string): Promise<string> {
  return await createAgentSession(agentId, `overnight markdown rendering ${Date.now()}`);
}

async function waitForAssistant(sessionId: string): Promise<Message[]> {
  const deadline = Date.now() + 8 * 60 * 1000;
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
  throw new Error(`assistant markdown rendering turn did not finish; last=${JSON.stringify(last).slice(0, 1000)}`);
}

test.setTimeout(10 * 60 * 1000);

test('overnight real UI renders a real markdown table list and code block', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no CLIO backend reachable at ${BACKEND}`);

  const agentId = await ensureMarkdownAgent();
  const sessionId = await createSession(agentId);
  const browser = await bootBrowser(['--disable-web-security']);
  const { ctx, page } = await openConnected(browser);
  try {
    await selectSession(page, sessionId);
    await sendPrompt(
      page,
      [
        'Return only markdown. Do not wrap the whole answer in a code fence.',
        'Use exactly this structure:',
        '# Rendering Probe',
        '',
        '| Surface | Expected UI |',
        '| --- | --- |',
        '| table | rendered as a table |',
        '| list | rendered as bullets |',
        '| code | rendered as a fenced code block |',
        '',
        '- first bullet',
        '- second bullet with `inline_code_probe`',
        '',
        '```python',
        'def probe_rendering(value: int) -> int:',
        '    return value + 1',
        '```',
      ].join('\n'),
    );
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: shot('overnight-real-rendering-early'), fullPage: false });

    const messages = await waitForAssistant(sessionId);
    writeFileSync(
      resolve(auditDir, 'overnight-real-rendering-messages.json'),
      JSON.stringify({ backend: BACKEND, workspaceId: WORKSPACE_ID, sessionId, messages }, null, 2),
    );

    const assistant = page.locator('.trx-msg--assistant').last();
    const table = page.locator('.trx-msg--assistant .im__table').last();
    const list = page.locator('.trx-msg--assistant .im__list').last();
    const code = page.locator('.trx-msg--assistant .im__code').last();
    await expect(table).toBeVisible({ timeout: 10_000 });
    await expect(list).toBeVisible({ timeout: 10_000 });
    await expect(code).toBeVisible({ timeout: 10_000 });
    await expect(assistant).toContainText('inline_code_probe', { timeout: 10_000 });
    await table.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.screenshot({ path: shot('overnight-real-rendering-table'), fullPage: false });
    await code.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.screenshot({ path: shot('overnight-real-rendering-settled'), fullPage: false });
  } finally {
    await deleteAgent(agentId);
    await ctx.close();
    await browser.close();
  }
});
