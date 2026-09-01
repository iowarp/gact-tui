import { describe, expect, it } from 'vitest';
import { sanitizeMermaidSvg, validateMermaidSource } from './mermaid-security';

describe('Mermaid trust boundary', () => {
  it('accepts declarative scientific workflows', () => {
    expect(() =>
      validateMermaidSource('flowchart LR\n  catalog[Catalog] --> result[Defensible result]'),
    ).not.toThrow();
  });

  it.each([
    '%%{init: {"securityLevel": "loose"}}%%\nflowchart LR\na-->b',
    'flowchart LR\na-->b\nclick a javascript:alert(1)',
    'flowchart LR\na[<b>unsafe</b>] --> b',
  ])('rejects executable or HTML source', (source) => {
    expect(() => validateMermaidSource(source)).toThrow(
      'Diagram contains an unsupported executable or HTML directive',
    );
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
