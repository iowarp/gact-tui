import type { LmConfigSnapshot } from '../wire/types.js';
import { AgentClient } from './agent_client.js';
import {
  authenticateProvider,
  fetchLmConfig,
  fetchProvider,
  fetchProviderModels,
  fetchProviders,
  updateLmConfig,
} from './providers.js';
import type {
  AuthProviderResult,
  ProviderDetail,
  ProviderModelsResult,
  ProvidersResult,
  SetLmInput,
} from './providers.js';

export class ProviderSettingsClient extends AgentClient {
  providers(): Promise<ProvidersResult> {
    return fetchProviders(this);
  }

  getProvider(providerId: string): Promise<ProviderDetail> {
    return fetchProvider(this, providerId);
  }

  providerModels(providerId: string, apiBase?: string): Promise<ProviderModelsResult> {
    return fetchProviderModels(this, providerId, apiBase);
  }

  lmConfig(): Promise<LmConfigSnapshot> {
    return fetchLmConfig(this);
  }

  setLm(body: SetLmInput): Promise<LmConfigSnapshot> {
    return updateLmConfig(this, body);
  }

  authProvider(providerId: string): Promise<AuthProviderResult> {
    return authenticateProvider(this, providerId);
  }
}
