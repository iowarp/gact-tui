import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { AttentionBlock, ToolInvocation } from '@clio/core/v3';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ToolAttentionField } from './tool-attention-fields';
import { verifiedToolField } from '@/lib/verified-tool-field';
import { transcriptContentSelection } from '@/lib/transcript-content-selection';

afterEach(cleanup);
const source = 'A🦉A evidence';
const block: AttentionBlock = {
  message_id: 'm',
  part_id: 'result-1',
  call_id: 'call-1',
  field: 'result',
  kind: 'tool_result',
  source_text: source,
  content_revision: bytesToHex(sha256(new TextEncoder().encode(source))),
  share: 0.3,
  mean: 0.1,
  runs: [[1, 2, 0.1]],
  display_runs: [[1, 2, 0.8]],
};
const tool = {
  id: 'call-1',
  name: 'read',
  output: { content: [{ type: 'text', text: source }] },
} as ToolInvocation;

it('renders exact Unicode heat and retains selection identity inside a portal field', () => {
  const { container } = render(<ToolAttentionField block={block} tool={tool} sessionId="s" />);
  const pre = container.querySelector('pre')!;
  expect(pre.textContent).toBe(source);
  expect(pre.querySelector('[class*="bg-primary"]')).toHaveTextContent('🦉');
  const owl = pre.querySelector('[class*="bg-primary"]')!.firstChild!;
  const range = document.createRange();
  range.setStart(owl, 0);
  range.setEnd(owl, 2);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  expect(transcriptContentSelection(selection)).toMatchObject({
    session_id: 's',
    message_id: 'm',
    part_id: 'result-1',
    field: 'result',
    call_id: 'call-1',
    selection: { kind: 'text', start: 1, end: 2 },
  });
});

it('refuses stale results and validates current arguments before trusting captured whitespace', () => {
  expect(verifiedToolField(block, { ...tool, output: [{ type: 'text', text: source }] })).toBe(
    source,
  );
  render(<ToolAttentionField block={block} tool={{ ...tool, output: 'changed' }} />);
  expect(screen.getByRole('status')).toHaveTextContent('changed or unloaded');
  const json = '{"x": "🦉", "n": 2}';
  const input = {
    ...block,
    field: 'input',
    kind: 'tool_input' as const,
    source_text: json,
    content_revision: bytesToHex(sha256(new TextEncoder().encode(json))),
  };
  expect(verifiedToolField(input, { ...tool, input: { n: 2, x: '🦉' } })).toBe(json);
  expect(verifiedToolField(input, { ...tool, input: { n: 3, x: '🦉' } })).toBeUndefined();
});
