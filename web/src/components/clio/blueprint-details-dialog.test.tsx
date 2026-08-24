import type { AgentBlueprint } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlueprintDetailsDialog } from './blueprint-details-dialog';

const blueprint: AgentBlueprint = {
  id: 'earthscope',
  title: 'EarthScope agent',
  display_name: 'EarthScope GNSS agent',
  description: 'Reviews regional station evidence.',
  version: '1.2.0',
  scope: 'global',
  enabled: true,
  validation_errors: [],
  kind: 'blueprint',
  metadata: {
    body: '# Evidence workflow\n\nReview stations before drawing a conclusion.',
    mcp_servers: { earthscope: {} },
    install: {
      source: '/marketplaces/science/earthscope',
      installed_at: '2026-08-23T18:00:00Z',
    },
  },
};

afterEach(cleanup);

describe('BlueprintDetailsDialog', () => {
  it('shows product details before rendering full instructions on request', async () => {
    const user = userEvent.setup();
    render(<BlueprintDetailsDialog blueprint={blueprint} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Every workspace')).toBeVisible();
    expect(screen.getByText('earthscope')).toHaveAttribute(
      'title',
      '/marketplaces/science/earthscope',
    );
    expect(screen.queryByRole('heading', { name: 'Evidence workflow' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View blueprint instructions' }));

    expect(await screen.findByRole('heading', { name: 'Evidence workflow' })).toBeVisible();
    expect(screen.getByText(/Review stations before drawing a conclusion/)).toBeVisible();
  });
});
