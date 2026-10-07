import type { ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  getToolPresentation,
  getToolSummary,
  getToolActivityTitle,
  humanizeToolName,
} from './tool-presentation';

describe('declared tool presentation', () => {
  it('identifies general, selected and batched widget catalog loads consistently', () => {
    const tool: ToolInvocation = {
      id: 'catalog',
      session_id: 'session',
      state: 'succeeded',
      name: 'load_skill',
      title: 'Load skill',
      input: { skill_id: 'a2ui-catalog-clio-workspace' },
      presentation: {
        summary: '',
        subject: 'skill',
        blocks: [{ id: 'skill', type: 'text', text: 'a2ui-catalog-clio-workspace' }],
      },
    };
    expect(getToolActivityTitle(tool)).toBe('Inspect widget catalog (General)');
    expect(
      getToolActivityTitle({
        ...tool,
        input: { skill_id: 'a2ui-catalog-clio-workspace', file: 'catalog.json#/components/Image' },
      }),
    ).toBe('Inspect widget catalog (Image)');
    expect(
      getToolActivityTitle({
        ...tool,
        input: {
          kwargs: {
            skill_id: 'a2ui-catalog-clio-workspace',
            file: 'catalog.json#/components/Image',
          },
        },
      }),
    ).toBe('Inspect widget catalog (Image)');
    expect(
      getToolActivityTitle({
        ...tool,
        input: {
          skill_id: 'a2ui-catalog-clio-workspace',
          files: [
            'catalog.json#/components/Image',
            'catalog.json#/components/Text',
            'catalog.json#/components/Image',
          ],
        },
      }),
    ).toBe('Inspect widget catalog (Image, Text)');
    expect(
      getToolPresentation({ ...tool, name: 'create_a2ui_surface', title: 'Generate UI element' })
        .title,
    ).toBe('Generate widget');
    expect(
      getToolPresentation({
        ...tool,
        name: 'prepare_execution_runtime',
        title: 'Prepare execution runtime',
      }).title,
    ).toBe('Get execution environment');
  });
  it.each(['fs_read_file', 'create_a2ui_surface', 'shell_bash', 'third_party_tool'])(
    'uses provider labels consistently for %s',
    (name) => {
      const tool: ToolInvocation = {
        id: 'call',
        session_id: 'session',
        state: 'succeeded',
        name,
        title: 'Provider label',
        presentation: { summary: 'Provider summary', blocks: [] },
      };
      expect(getToolPresentation(tool)).toEqual({ title: 'Provider label', kind: 'tool' });
      expect(getToolSummary(tool)).toBe('Provider summary');
      expect(getToolPresentation({ ...tool, title: undefined }).title).toBe(name);
      expect(humanizeToolName(name)).toBe(name);
    },
  );
  it.each(['message', 'path', 'stdout', 'summary', 'status'])(
    'does not infer transcript prose from raw %s',
    (key) => {
      const tool: ToolInvocation = {
        id: 'call',
        session_id: 'session',
        state: 'succeeded',
        name: 'tool',
        output: { [key]: 'raw technical result' },
      };
      expect(getToolSummary(tool)).toBeUndefined();
    },
  );
});
