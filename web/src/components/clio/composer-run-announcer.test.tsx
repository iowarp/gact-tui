import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComposerRunAnnouncer } from './composer-run-announcer';

const status = (container: HTMLElement) =>
  container.querySelector('[data-slot="composer-run-status"]');

describe('ComposerRunAnnouncer', () => {
  it('stays silent on the state it opens on', () => {
    const { container } = render(<ComposerRunAnnouncer queued={0} sending={false} state="running" />);
    expect(status(container)).toHaveTextContent('');
  });

  it('announces run changes and queue growth, but not an in-flight send', () => {
    const { container, rerender } = render(
      <ComposerRunAnnouncer queued={0} sending={false} state="completed" />,
    );
    rerender(<ComposerRunAnnouncer queued={0} sending state="queued" />);
    expect(status(container)).toHaveTextContent('');
    rerender(<ComposerRunAnnouncer queued={0} sending={false} state="running" />);
    expect(status(container)).toHaveTextContent('Running');
    rerender(<ComposerRunAnnouncer queued={1} sending={false} state="running" />);
    expect(status(container)).toHaveTextContent('Message queued. 1 queued message');
    rerender(<ComposerRunAnnouncer queued={0} sending={false} state="completed" />);
    expect(status(container)).toHaveTextContent('Finished. Queue is empty');
  });
});
