import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { lazyWithPreload } from './lazy-with-preload';

function Content() {
  return <p>Loaded content</p>;
}

describe('lazyWithPreload', () => {
  it('renders without the fallback once preloaded', async () => {
    const load = vi.fn(() => Promise.resolve({ default: Content }));
    const Lazy = lazyWithPreload(load);
    await Lazy.preload();
    render(
      <Suspense fallback={<p>Loading</p>}>
        <Lazy />
      </Suspense>,
    );
    expect(screen.getByText('Loaded content')).toBeInTheDocument();
    expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('suspends normally without a preload and loads once', async () => {
    const load = vi.fn(() => Promise.resolve({ default: Content }));
    const Lazy = lazyWithPreload(load);
    render(
      <Suspense fallback={<p>Loading</p>}>
        <Lazy />
      </Suspense>,
    );
    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(await screen.findByText('Loaded content')).toBeInTheDocument();
    await Lazy.preload();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries a failed preload', async () => {
    const load = vi
      .fn<() => Promise<{ default: typeof Content }>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ default: Content });
    const Lazy = lazyWithPreload(load);
    await expect(Lazy.preload()).rejects.toThrow('offline');
    await expect(Lazy.preload()).resolves.toEqual({ default: Content });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
