import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';

describe('sandbox administration repository', () => {
  it('decodes the sandbox row including the desktop-panel-only fields', async () => {
    const transport = new RecordingTransport([
      {
        name: 'sandbox',
        status: 'degraded',
        detail: 'No OS write-confinement.',
        summary: 'No OS write-confinement.',
        config_source: 'runtime:sandbox',
        next_action: 'Run `clio sandbox setup` to provision the Codex Windows fence.',
        required: true,
        reason: 'codex_enforcement_unverified',
        setup_in_progress: false,
        codex_source: 'bundled',
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.sandboxStatus()).resolves.toEqual({
      name: 'sandbox',
      status: 'degraded',
      detail: 'No OS write-confinement.',
      summary: 'No OS write-confinement.',
      config_source: 'runtime:sandbox',
      next_action: 'Run `clio sandbox setup` to provision the Codex Windows fence.',
      required: true,
      reason: 'codex_enforcement_unverified',
      setup_in_progress: false,
      codex_source: 'bundled',
    });
    expect(transport.requests[0]).toMatchObject({ method: 'GET', path: '/v1/system/sandbox' });
  });

  it('treats an empty reason as absent — READY carries no typed reason', async () => {
    const transport = new RecordingTransport([
      {
        name: 'sandbox',
        status: 'ready',
        required: true,
        reason: '',
        setup_in_progress: false,
        codex_source: null,
      },
    ]);
    const repository = new ClioRepository(transport);

    const row = await repository.sandboxStatus();
    expect(row.reason).toBeUndefined();
    expect(row.codex_source).toBeUndefined();
  });

  it('decodes a started setup run and posts to the setup route', async () => {
    const transport = new RecordingTransport([
      {
        status: 'provisioned',
        reason: 'provisioned',
        elevated: true,
        row: {
          name: 'sandbox',
          status: 'ready',
          required: true,
          reason: '',
          setup_in_progress: false,
          codex_source: 'bundled',
        },
      },
    ]);
    const repository = new ClioRepository(transport);

    const result = await repository.setupSandbox();
    expect(result.status).toBe('provisioned');
    expect(result.elevated).toBe(true);
    expect(result.row?.status).toBe('ready');
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/system/sandbox/setup',
      acceptStatuses: [409, 501],
      // A UAC elevation prompt can sit unanswered for minutes — this must
      // not share the transport's ordinary, much shorter default timeout.
      timeoutMs: 600_000,
    });
  });

  it('decodes the typed 409 body (a setup already in flight) as a normal result, not a thrown error', async () => {
    const transport = new RecordingTransport([
      {
        status: 'sandbox_setup_in_progress',
        reason: 'sandbox_setup_in_progress',
        elevated: false,
        row: {
          name: 'sandbox',
          status: 'degraded',
          required: true,
          reason: 'codex_enforcement_unverified',
          setup_in_progress: true,
          codex_source: null,
        },
      },
    ]);
    const repository = new ClioRepository(transport);

    const result = await repository.setupSandbox();
    expect(result.reason).toBe('sandbox_setup_in_progress');
    expect(result.row?.setup_in_progress).toBe(true);
  });

  it('decodes the typed 501 body (off-Windows, nothing to provision) as a normal result', async () => {
    const transport = new RecordingTransport([
      {
        status: 'not_windows',
        reason: 'sandbox_setup_unsupported',
        elevated: false,
        row: {
          name: 'sandbox',
          status: 'degraded',
          required: true,
          reason: 'disabled_by_config',
          setup_in_progress: false,
          codex_source: null,
        },
      },
    ]);
    const repository = new ClioRepository(transport);

    const result = await repository.setupSandbox();
    expect(result.reason).toBe('sandbox_setup_unsupported');
  });
});
