import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { trackInfrastructureRecovery } from '@/tauri/ssh-recovery-progress';
import { SavedHostsCheck } from './saved-hosts-check';

describe('SavedHostsCheck', () => {
  it('counts the saved hosts while they are checked and disappears after', async () => {
    let advance!: () => void;
    let finish!: () => void;
    let check!: Promise<void>;
    const { container } = render(<SavedHostsCheck />);
    expect(container).toBeEmptyDOMElement();

    act(() => {
      check = trackInfrastructureRecovery(
        3,
        (next) =>
          new Promise<void>((resolve) => {
            advance = next;
            finish = resolve;
          }),
      );
    });
    await act(async () => {
      await Promise.resolve();
      advance();
    });
    expect(screen.getByRole('status')).toHaveTextContent(/^Checking saved .+ installs 1\/3$/u);

    await act(async () => {
      finish();
      await check;
    });
    expect(container).toBeEmptyDOMElement();
  });
});
