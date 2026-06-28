import type { PromptDef } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  promptCardClass,
  promptErrorResult,
  promptPreviewText,
  promptSaveResult,
  promptValidationResult,
} from '../../src/routes/discovery/PromptCardModel.js';

describe('PromptCardModel', () => {
  it('builds prompt card classes from validation and open state', () => {
    expect(promptCardClass({ id: 'ok' } as PromptDef, false)).toBe(
      'dp__card prompts__card ',
    );
    expect(
      promptCardClass(
        { id: 'bad', validation_errors: ['missing profile'] } as PromptDef,
        true,
      ),
    ).toBe('dp__card prompts__card dp__card--err dp__card--open');
  });

  it('extracts preview text with a stable empty fallback', () => {
    expect(promptPreviewText({ prompt: { text: 'hello' } })).toBe('hello');
    expect(promptPreviewText({ prompt: { text: null } })).toBe('');
    expect(promptPreviewText({})).toBe('');
  });

  it('formats validation results from backend errors', () => {
    expect(promptValidationResult([])).toEqual({
      ok: true,
      msg: 'Prompt text is valid.',
    });
    expect(promptValidationResult(undefined)).toEqual({
      ok: true,
      msg: 'Prompt text is valid.',
    });
    expect(promptValidationResult(['a', 'b'])).toEqual({
      ok: false,
      msg: 'a; b',
    });
  });

  it('formats save and error results', () => {
    expect(promptSaveResult('workspace')).toEqual({
      ok: true,
      msg: 'Saved (workspace).',
    });
    expect(promptErrorResult(new Error('backend down'))).toEqual({
      ok: false,
      msg: 'backend down',
    });
    expect(promptErrorResult('no client')).toEqual({
      ok: false,
      msg: 'no client',
    });
  });
});
