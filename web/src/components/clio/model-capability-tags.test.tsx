import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  modelCapabilityTagLabel,
  type ModelCapabilityEvidence,
  type ModelCapabilityTag,
} from '@/lib/model-capability-tags';
import { ModelCapabilityTags } from './model-capability-tags';

afterEach(cleanup);

/**
 * An evidence row as the service sends it: a source plus the upstream field
 * and value verbatim. The raw half must never reach a tooltip.
 */
function stated(source: string, raw: string): ModelCapabilityEvidence[] {
  return [{ source, detail: raw } as ModelCapabilityEvidence];
}

const configuredContext: ModelCapabilityTag = {
  axis: 'context',
  value: '4096',
  evidence: stated('server_report', 'context_window (configured)'),
  contextBasis: 'configured',
  nativeContext: 32768,
};

async function hoverTag(tag: ModelCapabilityTag): Promise<HTMLElement> {
  const user = userEvent.setup();
  render(<ModelCapabilityTags tags={[tag]} />);
  await user.hover(screen.getByText(modelCapabilityTagLabel(tag)));
  await waitFor(() =>
    expect(document.querySelector('[data-slot="tooltip-content"]')).not.toBeNull(),
  );
  return document.querySelector<HTMLElement>('[data-slot="tooltip-content"]')!;
}

describe('ModelCapabilityTags: the context tooltip', () => {
  it('says what the size means in plain words, with no internal field name', async () => {
    const tooltip = await hoverTag(configuredContext);

    expect(tooltip).toHaveTextContent('Not loaded yet: the server will give it 4,096 tokens');
    expect(tooltip).toHaveTextContent('From the provider.');
    expect(tooltip.textContent).not.toMatch(/context_window/u);
  });

  it('opens below the tag, never over the model name above it', async () => {
    const tooltip = await hoverTag(configuredContext);

    expect(tooltip).toHaveAttribute('data-side', 'bottom');
  });
});

/** One tag of every kind a row can show, each carrying the raw upstream text a service sends. */
const EVERY_TAG: ReadonlyArray<{
  tag: ModelCapabilityTag;
  raw: string;
  meaning: string;
  source: string;
}> = [
  {
    tag: {
      axis: 'capability',
      value: 'tool_calling',
      evidence: stated('openrouter', 'supported_parameters=tools'),
    },
    raw: 'supported_parameters=tools',
    meaning: 'Can use tools.',
    source: 'From OpenRouter.',
  },
  {
    tag: {
      axis: 'capability',
      value: 'reasoning',
      evidence: stated('litellm', 'supports_reasoning=True'),
    },
    raw: 'supports_reasoning=True',
    meaning: 'Can think before answering.',
    source: 'From LiteLLM.',
  },
  {
    tag: {
      axis: 'input_modality',
      value: 'image',
      evidence: stated('openrouter', 'openrouter architecture.input_modalities'),
    },
    raw: 'architecture.input_modalities',
    meaning: 'Understands images.',
    source: 'From OpenRouter.',
  },
  {
    tag: {
      axis: 'output_modality',
      value: 'image',
      evidence: stated('openrouter', 'openrouter architecture.output_modalities'),
    },
    raw: 'architecture.output_modalities',
    meaning: 'Produces image.',
    source: 'From OpenRouter.',
  },
  {
    tag: {
      axis: 'size',
      value: '494M',
      evidence: stated(
        'hf_repo',
        'huggingface Qwen/Qwen2.5-0.5B-Instruct@7ae557604adf: safetensors.total=494032768',
      ),
    },
    raw: 'safetensors.total=494032768',
    meaning: '494M parameters.',
    source: 'From Hugging Face.',
  },
  {
    tag: {
      axis: 'context',
      value: '131072',
      evidence: stated('server_report', 'context_window (served)'),
    },
    raw: 'context_window',
    meaning: 'Reads up to 131,072 tokens at once.',
    source: 'From the provider.',
  },
  {
    tag: {
      axis: 'price',
      value: 'free',
      evidence: stated('server_report', "openrouter pricing prompt='0' completion='0'"),
    },
    raw: "prompt='0'",
    meaning: 'Costs nothing to use.',
    source: 'From the provider.',
  },
  {
    tag: {
      axis: 'recent',
      value: '6',
      evidence: stated('hf_repo', 'huggingface created_at=2026-07-01'),
    },
    raw: 'created_at=2026-07-01',
    meaning: 'Released in the last 6 months.',
    source: 'From Hugging Face.',
  },
  {
    tag: {
      axis: 'role',
      value: 'surrogate',
      evidence: stated('openrouter', "architecture.output_modalities=['decisions']"),
    },
    raw: "output_modalities=['decisions']",
    meaning: 'A specialist model: it does one task rather than hold a conversation.',
    source: 'From OpenRouter.',
  },
  {
    tag: {
      axis: 'task',
      value: 'classification',
      evidence: stated('openrouter', "architecture.output_modalities=['decisions']"),
      hubTasks: ['text-classification'],
    },
    raw: "output_modalities=['decisions']",
    meaning: 'Classifier. Hugging Face task: text classification.',
    source: 'From OpenRouter.',
  },
  {
    tag: {
      axis: 'domain',
      value: 'chemistry',
      evidence: stated('openrouter', 'domains=[chemistry]'),
    },
    raw: 'domains=[chemistry]',
    meaning: 'Built for chemistry.',
    source: 'From OpenRouter.',
  },
  {
    tag: {
      axis: 'kind',
      value: 'router',
      evidence: stated('server_report', "openrouter model author='openrouter'"),
    },
    raw: "author='openrouter'",
    meaning: 'Sends each request to a model chosen for it.',
    source: 'From the provider.',
  },
];

describe('ModelCapabilityTags: every tooltip is a plain meaning and a plain source', () => {
  it.each(EVERY_TAG.map((row) => [row.tag.axis + ':' + row.tag.value, row] as const))(
    '%s',
    async (_name, { tag, raw, meaning, source }) => {
      const tooltip = await hoverTag(tag);

      const lines = [...tooltip.querySelectorAll('[data-slot^="tag-"]')].map(
        (line) => line.textContent,
      );
      expect(lines).toEqual([meaning, source]);
      expect(tooltip.textContent).not.toContain(raw);
    },
  );
});
