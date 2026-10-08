import { contextSizingSpecSchema } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextControl, type ContextControlProps } from './context-control';
import {
  EMPTY_CONTEXT_DRAFT,
  contextDraftError,
  deploymentContextDraft,
  deploymentContextEntries,
  deploymentEffectiveContext,
  type ContextDraft,
} from './context-control-model';

afterEach(cleanup);

const strategies = [
  { id: 'fit_to_gpu', label: 'Largest that fits', description: 'Largest KV that fits' },
  { id: 'half_gpu', label: 'Half the GPU', description: 'Leave room for a second model' },
];

function Harness(props: Partial<ContextControlProps> & { initial?: ContextDraft }) {
  const [draft, setDraft] = useState<ContextDraft>(props.initial ?? EMPTY_CONTEXT_DRAFT);
  return (
    <>
      <ContextControl
        draft={draft}
        id="test-context"
        minimum={256}
        onDraft={setDraft}
        {...props}
      />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </>
  );
}

const draftOf = () => JSON.parse(screen.getByTestId('draft').textContent ?? '{}') as ContextDraft;

describe('context control model', () => {
  it('bounds a typed context by the minimum and the model maximum', () => {
    const bounds = { minimum: 256, maximum: 32_768 };
    expect(contextDraftError({ choice: 'number', tokens: '', strategy: '' }, bounds)).toMatch(
      /Type a context length/u,
    );
    expect(contextDraftError({ choice: 'number', tokens: '12.5', strategy: '' }, bounds)).toMatch(
      /whole number/u,
    );
    expect(contextDraftError({ choice: 'number', tokens: '100', strategy: '' }, bounds)).toBe(
      'At least 256 tokens.',
    );
    expect(contextDraftError({ choice: 'number', tokens: '40000', strategy: '' }, bounds)).toMatch(
      /At most 32,768 tokens/u,
    );
    expect(
      contextDraftError({ choice: 'number', tokens: '8192', strategy: '' }, bounds),
    ).toBeUndefined();
    expect(contextDraftError({ choice: 'max', tokens: '', strategy: '' }, bounds)).toBeUndefined();
  });

  it('maps a deployment choice onto the engine parameter and context keys', () => {
    const spec = contextSizingSpecSchema.parse({});
    const key = 'param.max_model_len';
    expect(deploymentContextDraft({ [key]: '4096' }, spec, key)).toEqual({
      choice: 'number',
      tokens: '4096',
      strategy: '',
    });
    expect(
      deploymentContextDraft(
        { 'context.choice': 'fit_to_gpu', 'context.strategy': 'half_gpu' },
        spec,
        key,
      ),
    ).toEqual({ choice: 'fit_to_gpu', tokens: '', strategy: 'half_gpu' });
    expect(
      deploymentContextEntries({ choice: 'max', tokens: '4096', strategy: 'x' }, spec, key),
    ).toEqual({ [key]: '', 'context.choice': 'max', 'context.strategy': '' });
    expect(
      deploymentContextEntries({ choice: 'number', tokens: '4096', strategy: '' }, spec, key),
    ).toEqual({ [key]: '4096', 'context.choice': 'number', 'context.strategy': '' });
  });

  it('reads the effective context a deployment settled on', () => {
    expect(deploymentEffectiveContext({})).toBeUndefined();
    expect(
      deploymentEffectiveContext({
        'effective.context_length': '65536',
        'effective.context_reason': 'KV cache fits in 0.9 of 1 GPU',
      }),
    ).toEqual({ length: 65_536, reason: 'KV cache fits in 0.9 of 1 GPU', choice: undefined });
  });
});

describe('ContextControl', () => {
  it('hides Fit to GPU when the service says it is unavailable', () => {
    render(<Harness fitToGpu={{ available: false, strategies }} maximum={32_768} />);
    expect(screen.getByLabelText('Context length')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Max' })).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Fit to GPU' })).not.toBeInTheDocument();
  });

  it('offers the factory strategies when Fit to GPU is available', () => {
    render(
      <Harness
        fitToGpu={{ available: true, strategies, defaultStrategy: 'fit_to_gpu', value: 65_536 }}
        initial={{ choice: 'fit_to_gpu', tokens: '', strategy: '' }}
        maximum={131_072}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Fit to GPU' })).toHaveTextContent(
      'Largest that fits',
    );
    expect(screen.getByLabelText('Context length')).toHaveValue(65_536);
    expect(screen.getByText(/Fit to GPU: Largest that fits \(65,536 tokens\)/u)).toBeVisible();
  });

  it('sets the model maximum with Max and validates a typed value', async () => {
    const user = userEvent.setup();
    render(<Harness maximum={32_768} />);
    await user.click(screen.getByRole('button', { name: 'Max' }));
    expect(draftOf().choice).toBe('max');
    expect(screen.getByLabelText('Context length')).toHaveValue(32_768);
    expect(screen.getByRole('button', { name: 'Max' })).toHaveAttribute('aria-pressed', 'true');

    const input = screen.getByLabelText('Context length');
    await user.clear(input);
    await user.type(input, '50000');
    expect(draftOf()).toEqual({ choice: 'number', tokens: '50000', strategy: '' });
    expect(screen.getByRole('alert')).toHaveTextContent('At most 32,768 tokens');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('uses the engine ceiling only while the model maximum is unknown', async () => {
    const user = userEvent.setup();
    render(<Harness ceiling={1_000} />);
    await user.type(screen.getByLabelText('Context length'), '2000');
    expect(screen.getByRole('alert')).toHaveTextContent('At most 1,000 tokens');
  });

  it('shows the effective value and its reason after deploy or save', () => {
    render(<Harness effective={{ length: 16_384, reason: 'Fit to GPU on 1 GPU' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'In force: 16,384 tokens · Fit to GPU on 1 GPU',
    );
  });
});
