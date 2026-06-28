import { createRoot } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { ToastInput } from '../../src/components/Toast.js';
import { createChatToasts } from '../../src/routes/chatToasts.js';

describe('createChatToasts', () => {
  it('bridges clio toast events and unregisters on cleanup', () => {
    const push = vi.fn<(input: ToastInput) => number>(() => 1);
    const dispose = createRoot((dispose) => {
      createChatToasts(push);
      return dispose;
    });

    window.dispatchEvent(
      new CustomEvent('clio:toast', {
        detail: { tone: 'info', title: 'Saved' },
      }),
    );

    expect(push).toHaveBeenCalledWith({ tone: 'info', title: 'Saved' });

    dispose();
    window.dispatchEvent(
      new CustomEvent('clio:toast', {
        detail: { tone: 'info', title: 'Ignored' },
      }),
    );

    expect(push).toHaveBeenCalledTimes(1);
  });

  it('formats failure toasts', () => {
    const push = vi.fn<(input: ToastInput) => number>(() => 1);
    createRoot((dispose) => {
      const retry = vi.fn();
      const { failToast } = createChatToasts(push);

      failToast('Failed', new Error('boom'), retry);

      expect(push).toHaveBeenCalledWith({
        tone: 'error',
        title: 'Failed',
        body: 'boom',
        action: { label: 'Retry', onClick: retry },
      });
      dispose();
    });
  });
});
