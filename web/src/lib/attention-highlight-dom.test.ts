import { describe, expect, it } from 'vitest';
import type { ResolvedAttentionBlock } from './attention-highlight-sources';
import {
  buildAttentionHighlightRanges,
  buildSelectedRange,
  findPartElement,
  mergeRunsByBucket,
  rangeFromTextOffsets,
} from './attention-highlight-dom';

describe('mergeRunsByBucket', () => {
  it('merges adjacent runs that land in the same bucket', () => {
    const merged = mergeRunsByBucket(
      [
        [0, 2, 0.9],
        [2, 4, 0.95],
        [10, 12, 0.9],
      ],
      1,
      4,
    );
    expect(merged).toEqual([
      { lo: 0, hi: 4, bucket: 3 },
      { lo: 10, hi: 12, bucket: 3 },
    ]);
  });

  it('keeps adjacent runs separate when their buckets differ', () => {
    const merged = mergeRunsByBucket(
      [
        [0, 2, 0.05],
        [2, 4, 0.95],
      ],
      1,
      4,
    );
    expect(merged.map((run) => run.bucket)).toEqual([0, 3]);
  });

  it('sorts unordered runs before merging', () => {
    const merged = mergeRunsByBucket(
      [
        [10, 12, 0.9],
        [0, 2, 0.9],
      ],
      1,
      4,
    );
    expect(merged[0]).toEqual({ lo: 0, hi: 2, bucket: 3 });
  });

  it('is empty for no runs', () => {
    expect(mergeRunsByBucket([], 1)).toEqual([]);
  });
});

describe('findPartElement', () => {
  it('finds the element nested under its message root', () => {
    document.body.innerHTML = `
      <div data-message-id="msg_1">
        <div data-part-id="u0" data-field="text">hello</div>
      </div>`;
    const found = findPartElement(document.body, 'msg_1', 'u0', 'text');
    expect(found?.textContent).toBe('hello');
  });

  it('returns null when the message root is missing', () => {
    document.body.innerHTML = '<div></div>';
    expect(findPartElement(document.body, 'msg_missing', 'u0', 'text')).toBeNull();
  });

  it('does not match a part id from a different message', () => {
    document.body.innerHTML = `
      <div data-message-id="msg_1"></div>
      <div data-message-id="msg_2"><div data-part-id="u0" data-field="text">other</div></div>`;
    expect(findPartElement(document.body, 'msg_1', 'u0', 'text')).toBeNull();
  });
});

describe('rangeFromTextOffsets', () => {
  it('spans a range across multiple text nodes', () => {
    const div = document.createElement('div');
    div.innerHTML = 'the <b>confirmed</b> column';
    document.body.append(div);
    // "confirmed" starts at offset 4 ("the ") and ends at 13.
    const range = rangeFromTextOffsets(div, 4, 13);
    expect(range?.toString()).toBe('confirmed');
  });

  it('returns undefined past the end of the text', () => {
    const div = document.createElement('div');
    div.textContent = 'short';
    expect(rangeFromTextOffsets(div, 10, 20)).toBeUndefined();
  });
});

describe('buildAttentionHighlightRanges', () => {
  it('produces a range per bucket, skipping blocks whose element is not mounted', () => {
    document.body.innerHTML = `
      <div data-message-id="msg_1">
        <div data-part-id="u0" data-field="text">the confirmed column names</div>
      </div>`;
    const resolved: ResolvedAttentionBlock[] = [
      {
        block: {
          message_id: 'msg_1',
          part_id: 'u0',
          field: 'text',
          kind: 'user_text',
          share: 0.1,
          mean: 0.01,
          runs: [[4, 13, 1.0]],
        },
        sourceText: 'the confirmed column names',
      },
      {
        block: {
          message_id: 'msg_1',
          part_id: 'not_mounted',
          field: 'text',
          kind: 'user_text',
          share: 0.1,
          mean: 0.01,
          runs: [[0, 3, 1.0]],
        },
        sourceText: 'the confirmed column names',
      },
    ];
    const { heat } = buildAttentionHighlightRanges(document.body, resolved, 1, 4);
    const totalRanges = heat.reduce((count, bucket) => count + bucket.length, 0);
    expect(totalRanges).toBe(1);
    expect(heat[3]?.[0]?.toString()).toBe('confirmed');
  });
});

describe('buildSelectedRange', () => {
  it('highlights the exact selected span using its resolved source text', () => {
    document.body.innerHTML = `
      <div data-message-id="msg_1">
        <div data-part-id="a0" data-field="text">the confirmed column names</div>
      </div>`;
    const data = {
      available: true as const,
      message_id: 'msg_1',
      selection: { part_id: 'a0', field: 'text', start: 4, end: 13, text: 'confirmed' },
      residual: 0.5,
      sources: [],
      flags: [],
      blocks: [],
    };
    const range = buildSelectedRange(document.body, data, 'the confirmed column names');
    expect(range?.toString()).toBe('confirmed');
  });

  it('is undefined when the selection carries no location', () => {
    const data = {
      available: true as const,
      message_id: 'msg_1',
      selection: { text: 'confirmed' },
      residual: 0.5,
      sources: [],
      flags: [],
      blocks: [],
    };
    expect(buildSelectedRange(document.body, data, 'the confirmed column names')).toBeUndefined();
  });
});
