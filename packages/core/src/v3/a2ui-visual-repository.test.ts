import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';

describe('visual capture transport', () => {
  it('sends displayed PNG bytes to an owned report and validates its download ticket', async () => {
    const response = {
      download_path: `/v1/session-export-downloads/${'a'.repeat(64)}`,
      filename: 'dashboard.png',
      artifact_id: 'image',
    };
    const transport = new RecordingTransport([response]);
    expect(
      await new ClioRepository(transport).prepareDashboardImageExport('a b', 'c d', 'png'),
    ).toEqual(response);
    expect(transport.requests[0]!.path).toBe('/v1/sessions/a%20b/dashboards/c%20d/export');
    expect(transport.requests[0]!.body).toEqual({ png_base64: 'png' });
  });
  it('preserves a saved-view control and both acknowledgement epochs', async () => {
    const request = {
      request_id: 'control',
      surface_id: 'surface',
      revision: 3,
      view_revision: 9,
      component_id: '',
      artifact_id: 'saved',
      data_model_update: { path: '/tab', value: 'analysis' },
    };
    const transport = new RecordingTransport([{ requests: [request] }, { accepted: true }]);
    const repository = new ClioRepository(transport);
    expect(
      await repository.reportA2uiViewer('sid', {
        viewer_id: 'viewer',
        surface_id: 'surface',
        revision: 3,
        view_revision: 9,
        visible: true,
        ready: true,
        artifact_id: 'saved',
        state: {},
      }),
    ).toEqual([request]);
    const acknowledgement = {
      request_id: 'control',
      viewer_id: 'viewer',
      revision: 3,
      previous_view_revision: 9,
      view_revision: 12,
    };
    await repository.completeA2uiCapture('sid', acknowledgement);
    expect(transport.requests[1]!.body).toEqual(acknowledgement);
  });
  it('claims one correlated renderer request through the authenticated repository', async () => {
    const request = {
      request_id: 'capture',
      surface_id: 'surface',
      revision: 3,
      view_revision: 9,
      component_id: 'map',
      artifact_id: '',
    };
    const transport = new RecordingTransport([{ requests: [request] }, { accepted: true }]);
    const repository = new ClioRepository(transport);
    const viewer = {
      viewer_id: 'viewer',
      surface_id: 'surface',
      revision: 3,
      view_revision: 9,
      visible: true,
      ready: true,
      artifact_id: '',
      state: { camera: { zoom: 7 } },
    };
    expect(await repository.reportA2uiViewer('session with space', viewer)).toEqual([request]);
    expect(transport.requests[0]!.path).toBe(
      '/v1/sessions/session%20with%20space/a2ui/visual-feedback',
    );
    expect(transport.requests[0]!.body).toEqual(viewer);
    const reply = {
      request_id: 'capture',
      viewer_id: 'viewer',
      revision: 3,
      view_revision: 9,
      error: 'Map tiles unavailable',
    };
    await repository.completeA2uiCapture('session with space', reply);
    expect(transport.requests[1]!.body).toEqual(reply);
  });
  it('rejects malformed capture requests instead of producing a blank screenshot', async () => {
    const transport = new RecordingTransport([
      { requests: [{ request_id: 'capture', revision: 'three' }] },
    ]);
    await expect(
      new ClioRepository(transport).reportA2uiViewer('session', {
        viewer_id: 'viewer',
        surface_id: 'surface',
        revision: 3,
        view_revision: 9,
        visible: true,
        ready: true,
        artifact_id: '',
        state: {},
      }),
    ).rejects.toThrow();
  });
});
