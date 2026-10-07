import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordedActivity, type RecordedPart, type RecordedTool } from './archive-timeline';

vi.mock('@/components/clio/grounded-message-response', () => ({
  GroundedMessageResponse: ({ children }: { children: string }) => <div>{children}</div>,
}));
afterEach(cleanup);

describe('archive activity chronology', () => {
  it('pages a long embedded output without losing its tail', () => {
    render(
      <RecordedActivity
        part={{ type: 'tool_result', call_id: 'a' }}
        tools={[
          { call_id: 'a', output: { stdout_spill: { status: 'spilled', path: '/store/output' } } },
        ]}
        outputs={[
          {
            source_path: '/store/output',
            archive_path: 'tool-output/s/output',
            bytes: 12009,
            text: 'x'.repeat(12000) + 'LAST LINE',
            embedded: true,
          },
        ]}
      />,
    );
    expect(screen.queryByText('LAST LINE')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('LAST LINE')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
  it('keeps complete output inline when the transcript has no sibling files', () => {
    render(
      <RecordedActivity
        part={{ type: 'tool_result', call_id: 'a' }}
        tools={[
          { call_id: 'a', output: { stdout_spill: { status: 'spilled', path: '/store/output' } } },
        ]}
        outputs={[
          {
            source_path: '/store/output',
            archive_path: 'tool-output/s/output',
            bytes: 4,
            text: 'Tail of complete output',
            embedded: true,
          },
        ]}
      />,
    );
    expect(screen.getByText('Tail of complete output')).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('keeps loaded instructions at the result position behind show more', () => {
    const { container } = render(
      <RecordedActivity
        part={{ type: 'tool_result', call_id: 'a' }}
        tools={[{ call_id: 'a', tool: 'load_skill', output: '# Procedure\nDo the real work' }]}
      />,
    );
    expect(screen.getByText('Show loaded skill instructions')).toBeVisible();
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    const disclosure = container.querySelector('details')!;
    disclosure.open = true;
    fireEvent(disclosure, new Event('toggle'));
    expect(container.textContent).toContain('Do the real work');
  });
  it('opens complete saved output through portable paths and embeds its captured text', () => {
    render(
      <RecordedActivity
        part={{ type: 'tool_result', call_id: 'a' }}
        tools={[
          {
            call_id: 'a',
            output: { stdout_spill: { status: 'spilled', path: '\\\\?\\D:\\state\\output.txt' } },
          },
        ]}
        outputs={[
          {
            source_path: 'D:\\state\\output.txt',
            archive_path: 'tool-output/s/output.txt',
            bytes: 21,
            text: 'Full output including the tail',
          },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Open complete saved output' })).toHaveAttribute(
      'href',
      'tool-output/s/output.txt',
    );
    expect(screen.getByText('Full output including the tail')).toBeVisible();
  });
  it('keeps parallel requests, recorded steps and results in their original positions', () => {
    const parts: RecordedPart[] = [
      { type: 'thinking', text: 'Reading the dataset description' },
      { type: 'tool_call', call_id: 'a', tool_name: 'read_file', input: { path: 'shortened' } },
      { type: 'tool_call', call_id: 'b', tool_name: 'shell_bash' },
      { type: 'tool_result', call_id: 'b', content: 'shortened output' },
      { type: 'tool_result', call_id: 'a' },
    ];
    const tools: RecordedTool[] = [
      {
        call_id: 'a',
        input: { path: 'manifest.json' },
        output: 'export_version = 6',
        status: 'completed',
      },
      {
        call_id: 'b',
        input: { kwargs: { command: 'python audit.py' } },
        output: { stdout: '412 rows checked' },
        status: 'completed',
      },
    ];
    const { container } = render(
      <>
        {parts.map((part, i) => (
          <RecordedActivity key={i} part={part} tools={tools} />
        ))}
      </>,
    );
    expect(
      Array.from(container.querySelectorAll('[data-part]'), (node) =>
        node.getAttribute('data-part'),
      ),
    ).toEqual(parts.map((part) => part.type));
    expect(screen.getByText('Reading the dataset description')).toBeVisible();
    expect(screen.getByText('manifest.json')).toBeVisible();
    expect(screen.getByText('python audit.py')).toBeVisible();
    expect(screen.getByText('412 rows checked')).toBeVisible();
    expect(screen.getByText('export_version = 6')).toBeVisible();
    expect(screen.queryByText('shortened output')).toBeNull();
    expect(container.querySelectorAll('details')).toHaveLength(0);
  });

  it('preserves failed legacy results and explicit missing fields', () => {
    render(
      <RecordedActivity
        part={{
          type: 'tool_result',
          call_id: 'old',
          tool_name: 'read_file',
          is_error: true,
          content: 'Access decisions could not be read',
        }}
        tools={[]}
      />,
    );
    expect(screen.getByText('Failed')).toBeVisible();
    expect(screen.getByText('Access decisions could not be read')).toBeVisible();
  });

  it('shows historical errors even when the recorded output is empty', () => {
    render(
      <RecordedActivity
        part={{ type: 'tool_result', call_id: 'old', tool_name: 'shell_bash' }}
        tools={[
          {
            call_id: 'old',
            status: 'failed',
            output: '',
            error: 'Connected-source access decisions could not be read',
          },
        ]}
      />,
    );
    expect(screen.getByText('Connected-source access decisions could not be read')).toBeVisible();
  });
});
