import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BACKEND_URL,
  DEFAULT_BACKEND_URL_LOCALHOST,
  DEFAULT_BACKEND_DISPLAY,
} from '../../src/backendDefaults.js';
import { DEFAULT_CONNECT_URL } from '../../src/routes/ConnectScreenModel.js';
import { DEFAULT_HTTP_BACKEND_URL } from '../../src/routes/AddRemoteBackendModel.js';
import { PURE_WEB_DEFAULT_BACKEND } from '../../src/routes/splashModel.js';

describe('backendDefaults', () => {
  it('exposes the clio backend default (port 17800) in both host forms', () => {
    expect(DEFAULT_BACKEND_URL).toBe('http://127.0.0.1:17800');
    expect(DEFAULT_BACKEND_URL_LOCALHOST).toBe('http://localhost:17800');
    expect(DEFAULT_BACKEND_DISPLAY).toBe('localhost:17800');
  });

  it('keeps the loopback-IP and hostname forms distinct (intentional host split)', () => {
    expect(DEFAULT_BACKEND_URL).not.toBe(DEFAULT_BACKEND_URL_LOCALHOST);
  });

  it('backs the legacy re-exports with the shared constants (each keeps its host)', () => {
    // Loopback-IP form: connect screen default.
    expect(DEFAULT_CONNECT_URL).toBe(DEFAULT_BACKEND_URL);
    // Hostname form: remote-backend wizard prefill + pure-web splash probe.
    expect(DEFAULT_HTTP_BACKEND_URL).toBe(DEFAULT_BACKEND_URL_LOCALHOST);
    expect(PURE_WEB_DEFAULT_BACKEND).toBe(DEFAULT_BACKEND_URL_LOCALHOST);
  });
});
