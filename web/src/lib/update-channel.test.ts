import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getUpdateChannel,
  initializeUpdateChannel,
  setUpdateChannel,
  subscribeUpdateChannel,
} from './update-channel';

beforeEach(() => {
  localStorage.clear();
  setUpdateChannel('stable');
  localStorage.clear();
});

describe('update preferences', () => {
  it('defaults stable installations to stable and existing beta installations to beta', () => {
    initializeUpdateChannel('0.9.4+24');
    expect(getUpdateChannel()).toBe('stable');
    localStorage.clear();
    initializeUpdateChannel('0.9.5-1');
    expect(getUpdateChannel()).toBe('beta');
  });
  it('persists an explicit opt-out across another beta startup', () => {
    initializeUpdateChannel('0.9.5b1');
    setUpdateChannel('stable');
    initializeUpdateChannel('0.9.5-beta.2');
    expect(getUpdateChannel()).toBe('stable');
  });
  it('persists opt-in across stable releases and notifies active version indicators', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUpdateChannel(listener);
    setUpdateChannel('beta');
    initializeUpdateChannel('0.9.5');
    expect(getUpdateChannel()).toBe('beta');
    expect(localStorage.getItem('clio.update-channel')).toBe('beta');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
