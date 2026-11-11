import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { deferredComponent, deferredModule, prefetchDeferredChunks } from './deferred-chunk';

describe('deferredModule', () => {
  it('loads once and retries after a failure', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue('chunk');
    const chunk = deferredModule(load);

    await expect(chunk.load()).rejects.toThrow('offline');
    expect(chunk.loaded()).toBeUndefined();
    await expect(chunk.load()).resolves.toBe('chunk');
    await chunk.load();
    expect(load).toHaveBeenCalledTimes(2);
    expect(chunk.loaded()).toBe('chunk');
  });

  it('is warmed by the idle prefetch', async () => {
    const load = vi.fn(async () => 'warm');
    const chunk = deferredModule(load);

    prefetchDeferredChunks();
    await vi.waitFor(() => expect(chunk.loaded()).toBe('warm'));
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('deferredComponent', () => {
  it('suspends on first use and renders synchronously once loaded', async () => {
    const Greeting = deferredComponent(async () => ({ name }: { name: string }) => (
      <p>Hello {name}</p>
    ));

    const first = render(
      <Suspense fallback={<p>Loading</p>}>
        <Greeting name="Ada" />
      </Suspense>,
    );
    expect(screen.getByText('Loading')).toBeTruthy();
    expect(await screen.findByText('Hello Ada')).toBeTruthy();
    first.unmount();

    render(
      <Suspense fallback={<p>Loading</p>}>
        <Greeting name="Grace" />
      </Suspense>,
    );
    expect(screen.getByText('Hello Grace')).toBeTruthy();
    expect(screen.queryByText('Loading')).toBeNull();
  });
});
