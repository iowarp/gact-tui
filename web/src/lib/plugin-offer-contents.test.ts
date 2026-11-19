import { describe, expect, it } from 'vitest';
import { offerContentParts, offerContentsLine } from './plugin-offer-contents';

describe('what an offered plugin brings, in words', () => {
  it('lists non-zero kinds only, with commas and "and", never a middle dot', () => {
    expect(
      offerContentsLine({ skills: ['a', 'b'], mcp_servers: ['s'], fragments: ['x', 'y'] }),
    ).toBe('Brings 2 skills, 1 MCP server and 2 prompt fragments to this conversation');
    expect(offerContentParts({ skills: [], tools: ['t'] })).toEqual(['1 tool']);
  });

  it('counts a connector as its server with the tool count once known', () => {
    expect(offerContentsLine({ skills: ['s'] }, { tool_count: 13 })).toBe(
      'Brings 1 skill and 1 MCP server (13 tools) to this conversation',
    );
    expect(offerContentsLine(undefined, { tool_count: null })).toBe(
      'Brings 1 MCP server to this conversation',
    );
  });

  it("does not count a connector's own server twice when its plugin declares it", () => {
    expect(
      offerContentsLine(
        { skills: ['s'], mcp_servers: ['viewer'] },
        { id: 'viewer', tool_count: 13 },
      ),
    ).toBe('Brings 1 skill and 1 MCP server (13 tools) to this conversation');
  });

  it('still says where it goes when nothing is known', () => {
    expect(offerContentsLine(undefined)).toBe('Adds it to this conversation only');
  });
});
