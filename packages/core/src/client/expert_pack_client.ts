import type {
  ExpertPackMutationOptions,
  ExpertPacksOptions,
  ExpertPacksResult,
  ExpertPackValidationResult,
  InstallExpertPackInput,
  InstallExpertPackResult,
  SessionExpertPackResult,
  SetSessionExpertPackInput,
  UpdateExpertPackResult,
  ValidateExpertPackInput,
} from './expert_packs.js';
import {
  fetchExpertPacks,
  fetchSessionExpertPack,
  installExpertPackDefinition,
  removeExpertPack,
  setSessionExpertPackBinding,
  updateExpertPackDefinition,
  validateExpertPackDefinition,
} from './expert_packs.js';
import { AgentBlueprintClient } from './agent_blueprint_client.js';

export class ExpertPackClient extends AgentBlueprintClient {
  /** GET /v1/sessions/{id}/expert-pack - currently-bound expert pack. */
  getSessionExpertPack(sessionId: string): Promise<SessionExpertPackResult> {
    return fetchSessionExpertPack(this, sessionId);
  }

  /** POST /v1/sessions/{id}/expert-pack - bind a pack. */
  setSessionExpertPack(sessionId: string, body: SetSessionExpertPackInput): Promise<unknown> {
    return setSessionExpertPackBinding(this, sessionId, body);
  }

  /** POST /v1/expert-packs/validate - validate a pack on the clio host. */
  async validateExpertPack(body: ValidateExpertPackInput): Promise<ExpertPackValidationResult> {
    return validateExpertPackDefinition(this, body);
  }

  /** GET /v1/expert-packs - list installed expert packs. */
  async expertPacks(options: ExpertPacksOptions = {}): Promise<ExpertPacksResult> {
    return fetchExpertPacks(this, options);
  }

  installExpertPack(body: InstallExpertPackInput): Promise<InstallExpertPackResult> {
    return installExpertPackDefinition(this, body);
  }

  updateExpertPack(
    packId: string,
    opts: ExpertPackMutationOptions = {},
  ): Promise<UpdateExpertPackResult> {
    return updateExpertPackDefinition(this, packId, opts);
  }

  deleteExpertPack(packId: string, opts: ExpertPackMutationOptions = {}): Promise<void> {
    return removeExpertPack(this, packId, opts);
  }
}
