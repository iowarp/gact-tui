/**
 * Clean-stream end-to-end replay.
 *
 * Feeds the real captured wire
 * (`tui/internal/ui/testdata/earthscope-la.wire.sse`) through the SAME path the
 * live web app uses — the top-level `reduce()` dispatcher — and asserts:
 *
 *   (a) the transcript message list is exactly the two REAL messages (1 user +
 *       1 assistant), with NO synthetic/phantom assistant messages injected by
 *       the semantic feed; and
 *   (b) the projected execution tree (`projectWebExecutionTimeline`) contains
 *       the expected delegation hierarchy and the expert outputs.
 *
 * Set WEB_WIRE_DUMP=1 to also write a human-readable dump of the projected tree
 * and the transcript part list to the scratchpad.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { reduce, type ExecutionTranscriptEvent } from '../../src/LiveReducer.js';
import { projectWebExecutionTimeline } from '../../src/components/executionProjectionTimeline.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WIRE = resolve(
  HERE,
  '../../../../tui/internal/ui/testdata/earthscope-la.wire.sse',
);

interface WireEvent {
  type?: string;
  payload?: Record<string, unknown>;
}

/** Parse an SSE capture into the decoded `data:` JSON payloads, in order. */
function parseWire(text: string): WireEvent[] {
  const events: WireEvent[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const json = line.slice('data:'.length).trim();
      if (!json) continue;
      events.push(JSON.parse(json) as WireEvent);
    }
  }
  return events;
}

/** Build a hook bag that records the two signals we assert on and no-ops the
 * rest, mirroring the real live transcript's `ReduceHooks` shape. */
function makeRecorder() {
  let messages: Message[] = [];
  let executionEvents: ExecutionTranscriptEvent[] = [];
  const apply = <T>(cur: T, next: T | ((p: T) => T)): T =>
    typeof next === 'function' ? (next as (p: T) => T)(cur) : next;
  const noop = () => {};
  const hooks = {
    setMessages: (n: Message[] | ((p: Message[]) => Message[])) => {
      messages = apply(messages, n);
    },
    setExecutionEvents: (
      n: ExecutionTranscriptEvent[] | ((p: ExecutionTranscriptEvent[]) => ExecutionTranscriptEvent[]),
    ) => {
      executionEvents = apply(executionEvents, n);
    },
    setLastCompletion: noop,
    setCostUsd: noop,
    setRunningTools: noop,
    setSessions: noop,
    setRenameToast: noop,
    setPendingPermission: noop,
    setPendingQuestion: noop,
    setSemanticEvents: noop,
    onNotification: noop,
    onUnhandled: noop,
  } as unknown as Parameters<typeof reduce>[1];
  return {
    hooks,
    get messages() {
      return messages;
    },
    get executionEvents() {
      return executionEvents;
    },
  };
}

describe('clean-stream wire replay', () => {
  const wire = parseWire(readFileSync(WIRE, 'utf8'));
  const rec = makeRecorder();
  for (const ev of wire) reduce({ type: ev.type, payload: ev.payload }, rec.hooks);
  const tree = projectWebExecutionTimeline(rec.executionEvents);

  it('produces exactly the two real messages — no phantom assistant turns', () => {
    expect(rec.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    // No synthetic message ids — both are the backend-issued msg_* ids.
    expect(rec.messages.every((m) => String(m.id ?? '').startsWith('msg_'))).toBe(true);
    // The user turn is the original prompt; the assistant turn carries parts.
    expect(rec.messages[0]?.parts?.[0]?.type).toBe('text');
    expect((rec.messages[1]?.parts?.length ?? 0)).toBeGreaterThan(0);
  });

  it('projects the expected delegation hierarchy', () => {
    const handoffs = tree
      .filter((n) => n.kind === 'handoff')
      .map((n) => `${n.parent}->${n.agent}@${n.depth}`);
    // main fans out to three top-level experts (depth 1)…
    expect(handoffs).toContain('main->geospatial@1');
    expect(handoffs).toContain('main->data@1');
    expect(handoffs).toContain('main->analysis@1');
    // …and `data`/`analysis` nest their own sub-experts one level deeper.
    expect(handoffs).toContain('data->ndp_dataset_discovery@2');
    expect(handoffs).toContain('data->earthscope_station_catalog@2');
    expect(handoffs).toContain('analysis->gnss_timeseries_analysis@2');
  });

  it('surfaces the expert extract outputs in the tree', () => {
    const reports = tree.filter((n) => n.kind === 'report');
    const geo = reports.find((n) => n.agent === 'geospatial');
    expect(geo?.text ?? '').toContain('Los Angeles');
    // Several experts emit extract reports with non-empty output text.
    const withText = reports.filter((n) => (n.text ?? '').trim().length > 0);
    expect(withText.length).toBeGreaterThanOrEqual(3);
  });

  it('optionally dumps the projection + transcript parts', () => {
    if (!process.env.WEB_WIRE_DUMP) return;
    const lines: string[] = [];
    lines.push('=== TRANSCRIPT MESSAGES ===');
    for (const m of rec.messages) {
      lines.push(`[${m.role}] id=${m.id} parts=${m.parts?.length ?? 0}`);
      for (const p of m.parts ?? []) {
        const txt = typeof (p as { text?: string }).text === 'string'
          ? (p as { text?: string }).text!.replace(/\s+/g, ' ').slice(0, 120)
          : '';
        lines.push(`   - ${p.type}${txt ? `: ${txt}` : ''}`);
      }
    }
    lines.push('');
    lines.push('=== PROJECTED EXECUTION TREE ===');
    for (const n of tree) {
      const indent = '  '.repeat(n.depth);
      let head = `${indent}[${n.kind}] ${n.agent}`;
      if (n.kind === 'handoff') head = `${indent}↳ ${n.parent || 'main'} → ${n.agent}`;
      if (n.toolName) head += ` tool=${n.toolName}`;
      lines.push(head);
      const body = (n.text ?? n.question ?? '').replace(/\s+/g, ' ').trim();
      if (body) lines.push(`${indent}    ${body.slice(0, 200)}`);
    }
    const out = resolve(
      '/tmp/claude-1000/-home-jcernuda-gact-tui/d4b40316-5461-4e7b-9cc8-d695a1341ed0/scratchpad/web_agentview.txt',
    );
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, lines.join('\n') + '\n', 'utf8');
    expect(readFileSync(out, 'utf8').length).toBeGreaterThan(0);
  });
});
