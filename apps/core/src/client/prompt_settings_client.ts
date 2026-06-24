import { ProviderSettingsClient } from './provider_settings_client.js';
import {
  fetchPrompt,
  fetchPrompts,
  reloadPromptSources,
  renderPromptTemplate,
  updatePrompt,
  validatePromptTemplate,
} from './prompts.js';
import type {
  GetPromptOptions,
  GetPromptResult,
  PromptScope,
  PromptsResult,
  RenderPromptInput,
  RenderPromptResult,
  SavePromptInput,
  SavePromptResult,
  ValidatePromptInput,
  ValidatePromptResult,
} from './prompts.js';

export class PromptSettingsClient extends ProviderSettingsClient {
  prompts(scope: PromptScope = {}): Promise<PromptsResult> {
    return fetchPrompts(this, scope);
  }

  getPrompt(promptId: string, options: GetPromptOptions = {}): Promise<GetPromptResult> {
    return fetchPrompt(this, promptId, options);
  }

  reloadPrompts(): Promise<unknown> {
    return reloadPromptSources(this);
  }

  savePrompt(promptId: string, body: SavePromptInput): Promise<SavePromptResult> {
    return updatePrompt(this, promptId, body);
  }

  renderPrompt(promptId: string, body: RenderPromptInput = {}): Promise<RenderPromptResult> {
    return renderPromptTemplate(this, promptId, body);
  }

  validatePrompt(promptId: string, body: ValidatePromptInput = {}): Promise<ValidatePromptResult> {
    return validatePromptTemplate(this, promptId, body);
  }
}
