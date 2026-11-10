import { describe, expect, it } from 'vitest';
import { sanitizeMermaidSvg, parseDiagramSource } from './mermaid-security';

describe('Mermaid trust boundary', () => {
  it('accepts declarative scientific workflows', () => {
    expect(() =>
      parseDiagramSource('flowchart LR\n  catalog[Catalog] --> result[Defensible result]'),
    ).not.toThrow();
  });

  it.each([
    '%%{init: {"securityLevel": "loose"}}%%\nflowchart LR\na-->b',
    'flowchart LR\na[<b>unsafe</b>] --> b',
  ])('rejects executable or HTML source', (source) => {
    expect(() => parseDiagramSource(source)).toThrow(
      'Diagram contains an unsupported executable or HTML directive',
    );
  });

  it.each(['javascript:alert(1)', 'call alert()', '"https://example.com/"'])(
    'rejects executable click target %s before rendering or navigation',
    (target) => {
      expect(() => parseDiagramSource(`flowchart LR\na-->b\nclick a ${target}`)).toThrow(
        'Diagram contains an unsupported executable or HTML directive',
      );
    },
  );

  it('rejects a folder navigation outside the workspace', () => {
    expect(() =>
      parseDiagramSource('flowchart LR\na-->b\nclick a "workspace-folder:../private"'),
    ).toThrow('Diagram clicks must name a relative workspace-folder target.');
  });

  it('removes executable SVG nodes and attributes after rendering', () => {
    const svg = sanitizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)"><text>Safe label</text></a></svg>',
    );

    expect(svg.querySelector('script')).toBeNull();
    expect(svg.hasAttribute('onload')).toBe(false);
    expect(svg.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(svg.textContent).toContain('Safe label');
  });
});
