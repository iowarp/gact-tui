import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModelCapabilityTag } from '@/lib/model-capability-tags';
import { ModelCapabilityTags } from './model-capability-tags';

afterEach(cleanup);

const configuredContext: ModelCapabilityTag = {
  axis: 'context',
  value: '4096',
  evidence: [{ source: 'server_report', detail: '' }],
  contextBasis: 'configured',
  nativeContext: 32768,
};

async function hoverTag(tag: ModelCapabilityTag): Promise<HTMLElement> {
  const user = userEvent.setup();
  render(<ModelCapabilityTags tags={[tag]} />);
  await user.hover(screen.getByText('4K configured'));
  await waitFor(() => expect(document.querySelector('[data-slot="tooltip-content"]')).not.toBeNull());
  return document.querySelector<HTMLElement>('[data-slot="tooltip-content"]')!;
}

describe('ModelCapabilityTags: the context tooltip', () => {
  it('says what the size means in plain words, with no internal field name', async () => {
    const tooltip = await hoverTag(configuredContext);

    expect(tooltip).toHaveTextContent('Not loaded yet: the server will give it 4,096 tokens');
    expect(tooltip).toHaveTextContent('From the provider.');
    expect(tooltip.textContent).not.toMatch(/context_window/u);
    expect(tooltip.querySelector('[data-slot="tag-evidence-detail"]')).toBeNull();
  });

  it('opens below the tag, never over the model name above it', async () => {
    const tooltip = await hoverTag(configuredContext);

    expect(tooltip).toHaveAttribute('data-side', 'bottom');
  });
});
