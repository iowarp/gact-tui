import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearPendingUpdateMarker,
  isUpdateInFlight,
  readPendingUpdateMarker,
  useUpdateFlowStore,
  writePendingUpdateMarker,
} from './update-flow-store';

beforeEach(() => {
  useUpdateFlowStore.getState().reset();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useUpdateFlowStore', () => {
  it('starts idle', () => {
    expect(useUpdateFlowStore.getState().step).toBe('idle');
  });

  it('walks the agent-update happy path: checking -> installing -> restarting', () => {
    const store = useUpdateFlowStore.getState();
    store.start('agent', '0.9.5.0');
    expect(useUpdateFlowStore.getState()).toMatchObject({
      step: 'checking',
      action: 'agent',
      version: '0.9.5.0',
    });

    store.setStep('installing');
    store.appendLine('Installing clio-agent...');
    store.appendLine('Successfully installed clio-agent-0.9.5.0');
    expect(useUpdateFlowStore.getState().step).toBe('installing');
    expect(useUpdateFlowStore.getState().lines).toEqual([
      'Installing clio-agent...',
      'Successfully installed clio-agent-0.9.5.0',
    ]);

    store.setStep('restarting');
    expect(useUpdateFlowStore.getState().step).toBe('restarting');
    expect(isUpdateInFlight(useUpdateFlowStore.getState().step)).toBe(true);
  });

  it('walks the combined desktop+agent path through downloading', () => {
    const store = useUpdateFlowStore.getState();
    store.start('both', '0.9.5.0');
    store.setStep('installing');
    store.setStep('downloading');
    store.setProgress({ downloadedBytes: 512, totalBytes: 2048 });

    expect(useUpdateFlowStore.getState()).toMatchObject({
      step: 'downloading',
      progress: { downloadedBytes: 512, totalBytes: 2048 },
    });
  });

  it('resumes into reconnecting after a persisted restart, then settles on finish', () => {
    const store = useUpdateFlowStore.getState();
    store.resume('agent', '0.9.5.0');
    expect(useUpdateFlowStore.getState().step).toBe('reconnecting');
    expect(isUpdateInFlight('reconnecting')).toBe(true);

    store.finish('0.9.5.0');
    expect(useUpdateFlowStore.getState()).toMatchObject({ step: 'done', version: '0.9.5.0' });
    expect(isUpdateInFlight('done')).toBe(false);
  });

  it('carries a typed reason on failure and never silently drops it', () => {
    const store = useUpdateFlowStore.getState();
    store.start('agent', '0.9.5.0');
    store.setStep('installing');
    store.fail('The managed CLIO agent service did not become ready in time.');

    const state = useUpdateFlowStore.getState();
    expect(state.step).toBe('failed');
    expect(state.reason).toBe('The managed CLIO agent service did not become ready in time.');
    expect(isUpdateInFlight('failed')).toBe(false);
  });

  it('resets back to idle with no stale reason, version, or lines', () => {
    const store = useUpdateFlowStore.getState();
    store.start('desktop');
    store.appendLine('some log line');
    store.fail('boom');
    store.reset();

    expect(useUpdateFlowStore.getState()).toMatchObject({
      step: 'idle',
      action: undefined,
      version: undefined,
      reason: undefined,
      lines: [],
    });
  });

  it('bounds retained install-progress lines', () => {
    const store = useUpdateFlowStore.getState();
    store.start('agent');
    for (let i = 0; i < 250; i += 1) store.appendLine(`line ${i}`);
    const { lines } = useUpdateFlowStore.getState();
    expect(lines.length).toBe(200);
    expect(lines[0]).toBe('line 50');
    expect(lines.at(-1)).toBe('line 249');
  });
});

describe('pending update marker', () => {
  it('round-trips through localStorage', () => {
    expect(readPendingUpdateMarker()).toBeUndefined();

    writePendingUpdateMarker({ action: 'both', version: '0.9.5.0', startedAt: 1_000 });
    expect(readPendingUpdateMarker()).toEqual({
      action: 'both',
      version: '0.9.5.0',
      startedAt: 1_000,
    });

    clearPendingUpdateMarker();
    expect(readPendingUpdateMarker()).toBeUndefined();
  });

  it('ignores a hand-edited or corrupted marker instead of throwing', () => {
    localStorage.setItem('clio.pending-update', '{not json');
    expect(readPendingUpdateMarker()).toBeUndefined();

    localStorage.setItem('clio.pending-update', JSON.stringify({ action: 'not-real' }));
    expect(readPendingUpdateMarker()).toBeUndefined();
  });
});
