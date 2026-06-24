import { describe, expect, it } from 'vitest';
import {
  buildModelItems,
  buildPermissionItems,
  selectedModelForId,
} from '../../src/components/ComposerPickerModel.js';
import type { ModelOption } from '../../src/components/ComposerTypes.js';

const MODELS: ModelOption[] = [
  {
    id: 'openai:gpt-4.1',
    providerId: 'openai',
    providerLabel: 'OpenAI',
    modelId: 'gpt-4.1',
    description: 'General purpose',
  },
  {
    id: 'anthropic:claude-sonnet',
    providerId: 'anthropic',
    providerLabel: 'Anthropic',
    modelId: 'claude-sonnet',
  },
];

describe('ComposerPickerModel', () => {
  it('builds permission choices in the canonical order with descriptions', () => {
    expect(buildPermissionItems().map((item) => [item.id, item.description])).toEqual([
      ['ask', 'Prompt me before every tool call'],
      ['auto-edits', 'Auto-approve safe file edits; ask for the rest'],
      ['plan', 'Read-only — plan changes, never apply'],
      ['auto', 'Auto-approve every action (use with care)'],
      ['bypass', 'Skip permissions entirely'],
    ]);
  });

  it('maps model options into grouped dropdown items', () => {
    expect(buildModelItems(MODELS)).toEqual([
      {
        id: 'openai:gpt-4.1',
        label: 'gpt-4.1',
        detail: 'OpenAI',
        description: 'General purpose',
        group: 'OpenAI',
        value: MODELS[0],
      },
      {
        id: 'anthropic:claude-sonnet',
        label: 'claude-sonnet',
        detail: 'Anthropic',
        description: undefined,
        group: 'Anthropic',
        value: MODELS[1],
      },
    ]);
  });

  it('finds the selected model by id', () => {
    expect(selectedModelForId(MODELS, 'anthropic:claude-sonnet')).toBe(MODELS[1]);
    expect(selectedModelForId(MODELS, 'missing')).toBeUndefined();
  });
});
