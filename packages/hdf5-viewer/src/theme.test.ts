import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, hostDarkRules } from './theme';

// The shape of h5web 17's only dark-mode block (class names are hashed).
const H5WEB_CSS = `
._root_abc { color: black }
@media (prefers-color-scheme: dark) {
  ._root_abc[data-allow-dark-mode] { filter: invert(1) }
  ._root_abc[data-allow-dark-mode] [data-keep-colors],
  ._root_abc[data-allow-dark-mode] [data-keep-canvas-colors] canvas { filter: invert(1) }
}
@media (min-width: 600px) {
  ._root_abc[data-allow-dark-mode] { color: red }
}
`;

function addStyle(css: string) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
}

afterEach(() => {
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
});

describe('hostDarkRules', () => {
  it('rescopes h5web dark rules from the OS query to data-theme="dark"', () => {
    addStyle(H5WEB_CSS);
    const rules = hostDarkRules(Array.from(document.styleSheets));
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatch(/^:root\[data-theme="dark"\] \._root_abc \{ filter: invert\(1\);? \}$/u);
    expect(rules[1]).toContain(':root[data-theme="dark"] ._root_abc [data-keep-colors]');
    expect(rules[1]).toContain(':root[data-theme="dark"] ._root_abc [data-keep-canvas-colors] canvas');
    expect(rules.join('\n')).not.toContain('data-allow-dark-mode');
  });

  it('ignores other media queries and sheets without dark rules', () => {
    addStyle('p { color: blue } @media print { p { color: black } }');
    expect(hostDarkRules(Array.from(document.styleSheets))).toEqual([]);
  });
});

describe('applyTheme', () => {
  it('sets the theme and installs the scoped rules once', () => {
    addStyle(H5WEB_CSS);
    applyTheme(document, 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyTheme(document, 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.querySelectorAll('style[data-host-dark-mode]')).toHaveLength(1);
  });
});
