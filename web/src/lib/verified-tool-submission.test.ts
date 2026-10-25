import { expect, it } from 'vitest';
import type { AttentionBlock, ToolInvocation } from '@clio/core/v3';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { toolResultText } from './attention-highlight-sources';
import { verifiedToolField } from './verified-tool-field';

it('attributes the captured submission result without attributing its later task body', () => {
  const receipt = { accepted: true, handle: 'task' };
  const tool: ToolInvocation = {
    id: 'call',
    session_id: 's',
    name: 'fetch',
    state: 'failed',
    output: 'Fetch failed',
    submission: { state: 'succeeded', output: receipt },
  };
  const text = toolResultText(receipt);
  const block = {
    field: 'result',
    kind: 'tool_result',
    content_revision: bytesToHex(sha256(new TextEncoder().encode(text))),
  } as AttentionBlock;
  expect(verifiedToolField(block, tool)).toBe(text);
  const other = {
    ...block,
    content_revision: bytesToHex(sha256(new TextEncoder().encode(toolResultText(tool.output)))),
  };
  expect(verifiedToolField(other, tool)).toBeUndefined();
});
