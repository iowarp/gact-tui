import type { ToolInvocation } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryToolResult } from './memory-tool-result';
import { ClioToolInvocation } from './tool-invocation';
const memoryProposals = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({ memoryProposals }) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://memory.test', token: '' } }),
}));
afterEach(cleanup);
const tool = (name: string, output: unknown): ToolInvocation => ({
  id: 'm',
  session_id: 's',
  name,
  title: name,
  state: 'succeeded',
  output,
});

describe('memory results visible in the conversation', () => {
  it('shows the actual red to blue correction by default in a compact activity row', () => {
    const { container } = render(
      <ClioToolInvocation
        compact
        tool={tool('update_memory', {
          memory: { action: 'updated', description: 'Color preferences' },
          previous_fact: { id: 'old', text: 'Favorite color is red.' },
          fact: { id: 'new', text: 'Favorite color is blue.' },
        })}
      />,
    );
    expect(screen.getByRole('list', { name: 'Memory facts' })).toBeVisible();
    expect(container.querySelector('del')).toHaveTextContent('red');
    expect(container.querySelector('ins')).toHaveTextContent('blue');
    expect(screen.queryByText('Edit in memory')).not.toBeInTheDocument();
  });
  it('shows facts read, while keeping retained old values out of the current list', () => {
    render(
      <MemoryToolResult
        tool={tool('memory_read', {
          facts: [
            { id: 'old', text: 'old color', live: false },
            { id: 'new', text: 'current color', live: true },
          ],
        })}
      />,
    );
    expect(screen.getByText('current color')).toBeVisible();
    expect(screen.queryByText('old color')).not.toBeInTheDocument();
  });
  it('does not invent an earlier value for legacy updates or missing results', () => {
    render(
      <MemoryToolResult tool={tool('update_memory', { fact: { id: 'new', text: 'Blue' } })} />,
    );
    expect(screen.getByText('The earlier value was not retained.')).toBeVisible();
    expect(screen.queryByLabelText('added')).not.toBeInTheDocument();
  });
  it('renders a proposal using its original captured change even if later accepted differently', async () => {
    memoryProposals.mockResolvedValue([
      {
        id: 'p',
        base_text: '- red {id=r, source=user}',
        proposed_text: '- ~~red~~ {id=r, source=user, superseded_by=b}\n- blue {id=b, source=user}',
        applied_text: '- green {id=g, source=user}',
      },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryToolResult tool={tool('propose_memory_change', { proposal: 'p' })} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('blue')).toBeVisible();
    expect(container.querySelector('del')).toHaveTextContent('red');
    expect(screen.queryByText('green')).not.toBeInTheDocument();
  });
  it('keeps fact text literal', () => {
    render(
      <MemoryToolResult
        tool={tool('create_memory', {
          fact: { id: 'x', text: '<script>red</script> [blue](url)' },
        })}
      />,
    );
    expect(screen.getByText('<script>red</script> [blue](url)')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

it('reads the complete recorded single-text-block envelope used by historical conversations', () => {
  render(
    <MemoryToolResult
      tool={tool('memory_read', [
        {
          id: 'record',
          type: 'text',
          text: JSON.stringify({
            facts: [{ id: 'r', live: true, text: 'Recorded red preference' }],
          }),
        },
      ])}
    />,
  );
  expect(screen.getByText('Recorded red preference')).toBeVisible();
});
it('does not parse a bounded preview as the saved result', () => {
  render(
    <MemoryToolResult
      tool={tool('memory_read', {
        truncated: true,
        original_chars: 9000,
        preview: JSON.stringify({ facts: [{ id: 'r', text: 'Invented complete result' }] }),
      })}
    />,
  );
  expect(screen.getByText('The facts were not retained with this result.')).toBeVisible();
  expect(screen.queryByText('Invented complete result')).not.toBeInTheDocument();
});
