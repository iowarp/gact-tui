import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Composer } from '../../src/components/Composer.js';

afterEach(cleanup);

describe('Composer submit failures', () => {
  it('restores the draft and shows the inline error when send rejects', async () => {
    render(() => (
      <Composer
        onSubmit={async () => {
          throw new Error('gact_http transport error: connection refused');
        }}
      />
    ));

    const input = screen.getByTestId('composer-input') as HTMLTextAreaElement;
    fireEvent.input(input, {
      target: { value: 'Run the shell command: rm -rf /tmp/scratch' },
    });
    fireEvent.click(screen.getByTestId('composer-send'));

    const err = await screen.findByTestId('composer-error');
    expect(err.textContent).toContain('gact_http transport error: connection refused');
    expect(input.value).toBe('Run the shell command: rm -rf /tmp/scratch');
  });
});
