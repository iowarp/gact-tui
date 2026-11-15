import { describe, expect, it, vi } from 'vitest';
import { describeRegionWith, regionDescription } from './mcp-app-describe-region';
import type { McpAppViewTools } from './mcp-app-view-tools';

describe('describe_region (KF2)', () => {
  it('reads the picture and the structured description', () => {
    const found = regionDescription({
      content: [
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
        { type: 'text', text: '{"footprints":[{"reference":"U1"}]}' },
      ],
      structuredContent: { footprints: [{ reference: 'U1' }], nets: ['GND'] },
    });
    expect(found.image).toBe('data:image/png;base64,AAAA');
    expect(found.under).toEqual({ footprints: [{ reference: 'U1' }], nets: ['GND'] });
  });

  it('falls back to the JSON text, and throws a view error', () => {
    expect(
      regionDescription({ content: [{ type: 'text', text: '{"nets":["VCC"]}' }] }).under,
    ).toEqual({
      nets: ['VCC'],
    });
    expect(() =>
      regionDescription({ isError: true, content: [{ type: 'text', text: 'not drawn' }] }),
    ).toThrow('not drawn');
  });

  it('asks only a view that lists the tool, with the rectangle in CSS pixels', async () => {
    const call = vi.fn(async () => ({ content: [{ type: 'text', text: '{}' }] }));
    const withTool = {
      has: (name: string) => name === 'describe_region',
      callAppTool: call,
    } as unknown as McpAppViewTools;
    const without = { has: () => false, callAppTool: call } as unknown as McpAppViewTools;
    expect(describeRegionWith(without, { x: 1, y: 2, width: 3, height: 4 })).toBeUndefined();
    await describeRegionWith(withTool, { x: 10, y: 20, width: 30, height: 40 });
    expect(call).toHaveBeenCalledWith('describe_region', { x: 10, y: 20, width: 30, height: 40 });
  });
});
