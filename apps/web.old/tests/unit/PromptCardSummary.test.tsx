import { cleanup, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import type { PromptDef } from '@clio/core';
import {
  PromptCardSummary,
  promptHasValidationErrors,
  promptProfileCount,
} from '../../src/routes/discovery/PromptCardSummary.js';

afterEach(cleanup);

const PROMPT = {
  id: 'clio.chat',
  title: 'Chat agent',
  description: 'Default chat instructions',
  default_profile: 'default',
  scope: 'builtin',
  source_path: '/prompts/chat.md',
  enabled: false,
  profiles: {
    default: {},
    terse: {},
  },
  validation_errors: ['Missing required field', 'Invalid profile', 'Bad scope', 'Hidden extra'],
} as unknown as PromptDef;

describe('PromptCardSummary', () => {
  it('renders prompt metadata and truncates validation errors', () => {
    render(() => <PromptCardSummary prompt={PROMPT} />);

    expect(screen.getByText('Chat agent')).toBeTruthy();
    expect(screen.getByText('clio.chat')).toBeTruthy();
    expect(screen.getByText('Default chat instructions')).toBeTruthy();
    expect(screen.getAllByText('default')).toHaveLength(2);
    expect(screen.getByText('builtin')).toBeTruthy();
    expect(screen.getByText('/prompts/chat.md')).toBeTruthy();
    expect(screen.getByText('disabled')).toBeTruthy();
    expect(screen.getByTestId('prompt-errors-clio.chat').textContent).toContain(
      '4 validation errors',
    );
    expect(screen.getByText('Missing required field')).toBeTruthy();
    expect(screen.getByText('Invalid profile')).toBeTruthy();
    expect(screen.getByText('Bad scope')).toBeTruthy();
    expect(screen.queryByText('Hidden extra')).toBeNull();
  });

  it('counts profiles and detects validation errors', () => {
    expect(promptProfileCount(PROMPT)).toBe(2);
    expect(promptHasValidationErrors(PROMPT)).toBe(true);
    expect(promptProfileCount({ id: 'empty' } as PromptDef)).toBe(0);
    expect(promptHasValidationErrors({ id: 'empty' } as PromptDef)).toBe(false);
  });
});
