import { describe, expect, it } from 'vitest';
import { parseDiagramSource } from './mermaid-security';
import { workspaceFolderPath } from '@/lib/workspace-folder-reference';

describe('guarded diagram folder links', () => {
  it.each([
    ['reports%23draft', 'reports#draft'],
    ['survey%3F', 'survey?'],
  ])('decodes a literal filename in %s', (encoded, path) => {
    expect(workspaceFolderPath(`workspace-folder:${encoded}`)).toBe(path);
  });
  it('extracts explicit targets and strips navigation before rendering', () => {
    expect(
      parseDiagramSource(
        'flowchart LR\n raw[Input] --> report[Report]\n click raw "workspace-folder:raw%20data" "Open input data"',
      ),
    ).toEqual({
      source: 'flowchart LR\n raw[Input] --> report[Report]',
      folders: [{ id: 'raw', label: 'Open input data', path: 'raw data' }],
    });
  });
  it.each([
    '/etc',
    'C:/Users',
    '..',
    'reports/../private',
    '%2e%2e/secrets',
    '%2fetc',
    '%5c%5cserver/share',
    '%00',
    '%GG',
    '%ff',
    'https://example.org',
    'reports?x=1',
  ])('does not grant access through %s', (path) => {
    expect(workspaceFolderPath(`workspace-folder:${path}`)).toBeUndefined();
    expect(() =>
      parseDiagramSource(`flowchart LR\n A-->B\n click A "workspace-folder:${path}"`),
    ).toThrow();
  });
  it.each([
    'click A callback',
    'click A "https://example.org"',
    'click A javascript:alert(1)',
    'A-->B; click A callback',
    '%%{init: {}}%%',
    '<script>run()</script>',
  ])('rejects executable source: %s', (directive) => {
    expect(() => parseDiagramSource(`flowchart LR\n ${directive}`)).toThrow();
  });
  it('does not confuse ordinary click text with a handler', () => {
    expect(() =>
      parseDiagramSource('flowchart LR\n A[Click to inspect] --> B[Continue]'),
    ).not.toThrow();
  });
  it('permits left-facing arrows without permitting HTML', () => {
    expect(() => parseDiagramSource('flowchart LR\n A <--> B')).not.toThrow();
  });
  it('rejects ambiguous folder routing for one node', () => {
    expect(() =>
      parseDiagramSource(
        'flowchart LR\n A-->B\n click A "workspace-folder:one"\n click A "workspace-folder:two"',
      ),
    ).toThrow('repeats');
  });
});

describe('sanitizeMermaidSvg', () => {
  it('drops animations, external CSS and handlers, and keeps the drawing styles', async () => {
    const { sanitizeMermaidSvg } = await import('./mermaid-security');
    const svg = sanitizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.n{fill:red;marker-end:url(#arrow)}</style>' +
        '<style>@import "https://evil.example/x.css";</style>' +
        '<a><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a>' +
        '<rect style="background:url(https://evil.example/p)" onclick="alert(1)"/></svg>',
    );
    const text = new XMLSerializer().serializeToString(svg);
    expect(text).toContain('url(#arrow)');
    expect(text).not.toMatch(/@import|<set|javascript:|evil\.example|onclick/u);
  });
});
