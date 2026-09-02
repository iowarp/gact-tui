import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playAttentionSound } from './attention-sound';

/** A minimal fake mirroring only what playAttentionSound touches. */
class FakeAudioContext {
  public state: AudioContextState = 'suspended';
  public currentTime = 0;
  public destination = {} as AudioDestinationNode;
  public closeCalls = 0;
  public resumeCalls = 0;

  resume(): Promise<void> {
    this.resumeCalls += 1;
    // Never settles — simulates a browser autoplay policy holding resume()
    // pending indefinitely (no user gesture yet).
    return new Promise(() => undefined);
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }

  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
    } as unknown as OscillatorNode;
  }

  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    } as unknown as GainNode;
  }
}

describe('playAttentionSound', () => {
  let originalAudioContext: unknown;

  beforeEach(() => {
    originalAudioContext = (window as { AudioContext?: unknown }).AudioContext;
  });

  afterEach(() => {
    vi.useRealTimers();
    (window as { AudioContext?: unknown }).AudioContext = originalAudioContext;
  });

  it('resolves false and closes the context when resume() never settles under an autoplay policy', async () => {
    vi.useFakeTimers();
    const fakeContext = new FakeAudioContext();
    (window as { AudioContext?: unknown }).AudioContext = vi.fn(
      () => fakeContext,
    ) as unknown as typeof AudioContext;

    const resultPromise = playAttentionSound();
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await resultPromise;

    expect(result).toBe(false);
    expect(fakeContext.closeCalls).toBe(1);
  });

  it('resolves true and does not close the context when resume() settles in time', async () => {
    const fakeContext = new FakeAudioContext();
    fakeContext.resume = async () => {
      fakeContext.resumeCalls += 1;
      fakeContext.state = 'running';
    };
    (window as { AudioContext?: unknown }).AudioContext = vi.fn(
      () => fakeContext,
    ) as unknown as typeof AudioContext;

    const result = await playAttentionSound();

    expect(result).toBe(true);
    expect(fakeContext.closeCalls).toBe(0);
  });
});
