import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import { RecordingTransport } from './recording-transport.test-helper.js';

describe('workspace preparation', () => {
  it('addresses only the selected workspace, with no session request', async () => {
    const transport = new RecordingTransport([{ status: 'warming' }]);
    const repository = new ClioRepository(transport);
    await expect(repository.warmWorkspace('remote/work')).resolves.toEqual({ status: 'warming' });
    expect(transport.requests).toEqual([
      expect.objectContaining({ method: 'POST', path: '/v1/workspaces/remote%2Fwork/warmup' }),
    ]);
  });

  it('rejects a response that claims an unrecognized preparation state', async () => {
    const repository = new ClioRepository(new RecordingTransport([{ status: 'ready' }]));
    await expect(repository.warmWorkspace('ws1')).rejects.toThrow();
  });
});
