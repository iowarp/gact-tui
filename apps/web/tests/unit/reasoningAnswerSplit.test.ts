import { describe, expect, it } from 'vitest';
import { buildAssistantTurnModel } from '../../src/components/transcriptDelegationModel.js';

/**
 * Regression for the clio "reasoning->answer swap" bug (the "beginning of the
 * turn breaks"): clio used to reuse the still-open `field=reasoning` streamed part
 * as the canonical answer, overwriting the reasoning with the answer on finalize.
 * The clio fix keeps the reasoning part intact and emits the answer as its own
 * part. These are the EXACT persisted parts from the verified live run — the
 * render must show the reasoning and the answer as DISTINCT rows, and never leak
 * `[[ ## … ## ]]` markers (which the provider thinking channel can quote).
 */
describe('reasoning/answer are distinct rows (no swap, no marker leak)', () => {
  const parts = [
    { type: 'routing_decision', text: '', metadata: {} },
    {
      type: 'thinking',
      text: "planning: 1. `[[ ## reasoning ## ]]` - explain\n2. `[[ ## answer ## ]]` - answer",
      metadata: {
        thinking_source: 'provider',
        signature_field_name: 'provider_thinking:claude_code_sdk',
      },
    },
    {
      type: 'text',
      text: 'This is asking for a conceptual definition rather than a specific regional analysis task.',
      metadata: { signature_field_name: 'reasoning' },
    },
    {
      type: 'text',
      text: "I'm limited to routing specific EarthScope GNSS regional analysis tasks, not providing general explanations.",
      metadata: { signature_field_name: null },
    },
  ] as unknown as Parameters<typeof buildAssistantTurnModel>[0];

  const model = buildAssistantTurnModel(parts, { streaming: false, role: 'assistant' });
  const rows = model?.rows ?? [];

  it('keeps the reasoning text and the answer text as separate, non-swapped content', () => {
    const loose = rows as ReadonlyArray<{ text?: string; providerThinking?: { text?: string } }>;
    const flat = loose
      .map((r) => r.text ?? '')
      .concat(loose.map((r) => r.providerThinking?.text ?? ''))
      .join('\n');
    expect(flat).toContain('conceptual definition');
    expect(flat).toContain("I'm limited to routing specific EarthScope");
  });

  it('keeps DSPy-extracted content rows marker-free, but renders provider-thinking prose verbatim', () => {
    // clio #877 / epic #880: the client is a pure verbatim renderer. The server's SDK
    // thinking/contract splitter promotes every real line-start header to the contract
    // stream, so no STRUCTURAL marker reaches the render; the DSPy field-extracted content
    // rows (reasoning/answer) are therefore marker-free by construction. A marker the model
    // QUOTES mid-prose while narrating the format stays in provider thinking as genuine
    // reasoning content and MUST render verbatim — the old client SECTION_MARKER strip that
    // removed it is what produced the mangled ", then , then" garble this epic kills.
    const loose = rows as ReadonlyArray<{ text?: string; providerThinking?: { text?: string } }>;
    const markerRe = /\[\[\s*##\s*[A-Za-z0-9_]+\s*##\s*\]\]/;

    const contentText = loose.map((r) => r.text ?? '').join('\n');
    expect(markerRe.test(contentText)).toBe(false); // reasoning/answer content never carries markers

    const thinkingText = loose.map((r) => r.providerThinking?.text ?? '').join('\n');
    expect(thinkingText).toContain('`[[ ## reasoning ## ]]`'); // quoted prose survives verbatim
    expect(thinkingText).toContain('`[[ ## answer ## ]]`');
  });
});
