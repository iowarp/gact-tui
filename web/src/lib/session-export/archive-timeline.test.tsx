import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordedValue } from './archive-timeline';

vi.mock('@/components/clio/grounded-message-response', () => ({
  GroundedMessageResponse: ({ children }: { children: string }) => <div>{children}</div>,
}));
afterEach(cleanup);

describe('recorded tool output', () => {
  it('pages a long embedded output without losing its tail', () => {
    render(
      <RecordedValue
        value={{ stdout_spill: { status: 'spilled', path: '/store/output' } }}
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
      <RecordedValue
        value={{ stdout_spill: { status: 'spilled', path: '/store/output' } }}
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

  it('opens complete saved output through portable paths and embeds its captured text', () => {
    render(
      <RecordedValue
        value={{ stdout_spill: { status: 'spilled', path: '\\\\?\\D:\\state\\output.txt' } }}
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
});
