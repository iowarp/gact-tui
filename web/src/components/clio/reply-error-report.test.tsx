import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportProblemRoute, useReportProblemRequests } from '@/hooks/use-open-report-problem';
import { ReplyErrorLine } from './conversation-message-blocks';

afterEach(cleanup);

function Listener({ onOpen }: { onOpen: (id?: string) => void }) {
  useReportProblemRequests(onOpen);
  return null;
}

describe('a failed reply’s Report this', () => {
  it('opens Report a problem about that conversation, beside Retry', () => {
    const open = vi.fn();
    const retry = vi.fn();
    render(
      <>
        <Listener onOpen={open} />
        <ReplyErrorLine
          onRetry={retry}
          reportSessionId="sess_failed"
          title="This reply didn’t load"
        />
      </>,
    );
    expect(screen.getByRole('button', { name: /Retry/u })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Report this' }));
    expect(open).toHaveBeenCalledWith('sess_failed');
    expect(retry).not.toHaveBeenCalled();
  });

  it('shows Report this even when the reply cannot be retried', () => {
    render(<ReplyErrorLine reportSessionId="sess_failed" title="This reply didn’t load" />);
    expect(screen.getByRole('button', { name: 'Report this' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Retry/u })).not.toBeInTheDocument();
  });

  it('leaves a cancelled reply’s marker alone', () => {
    render(<ReplyErrorLine kind="marker" reportSessionId="sess_failed" title="Reply cancelled" />);
    expect(screen.queryByRole('button', { name: 'Report this' })).not.toBeInTheDocument();
  });

  it('names the conversation in the settings route', () => {
    expect(reportProblemRoute()).toBe('/settings/report-problem');
    expect(reportProblemRoute('sess 1')).toBe('/settings/report-problem?conversation=sess+1');
  });
});
