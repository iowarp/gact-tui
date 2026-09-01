import { ClioRepository } from '@clio/core/v3';
import { BrowserClioTransport } from './transport/browser-transport';
import { inTauri } from './transport/tauri-runtime';
import { TauriClioTransport } from './transport/tauri-transport';

export interface ConnectionSettings {
  endpoint: string;
  token?: string;
  label?: string;
}

export interface SavedConnection {
  endpoint: string;
  label?: string;
}

export const DEFAULT_ENDPOINT = 'http://127.0.0.1:8787';

export function normalizeEndpoint(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Connection addresses must use http or https');
  }
  if (url.username || url.password) {
    throw new Error('Put access tokens in Advanced settings, not in the connection address');
  }
  return url.toString().replace(/\/$/, '');
}

export function createRepository(settings: ConnectionSettings): ClioRepository {
  const transport = inTauri()
    ? new TauriClioTransport(settings)
    : new BrowserClioTransport(settings);
  return new ClioRepository(transport);
}
