import type { ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { getToolPresentation, getToolSummary, humanizeToolName } from './tool-presentation';

describe('declared tool presentation', () => {
  it.each(['fs_read_file', 'create_a2ui_surface', 'shell_bash', 'third_party_tool'])(
    'uses provider labels consistently for %s', (name) => {
      const tool: ToolInvocation = { id: 'call', session_id: 'session', state: 'succeeded', name, title: 'Provider label', presentation: { summary: 'Provider summary', blocks: [] } };
      expect(getToolPresentation(tool)).toEqual({ title: 'Provider label', kind: 'tool' });
      expect(getToolSummary(tool)).toBe('Provider summary');
      expect(getToolPresentation({ ...tool, title: undefined }).title).toBe(name);
      expect(humanizeToolName(name)).toBe(name);
    },
  );
  it.each(['message', 'path', 'stdout', 'summary', 'status'])(
    'does not infer transcript prose from raw %s', (key) => {
      const tool: ToolInvocation = { id: 'call', session_id: 'session', state: 'succeeded', name: 'tool', output: { [key]: 'raw technical result' } };
      expect(getToolSummary(tool)).toBeUndefined();
    },
  );
});
