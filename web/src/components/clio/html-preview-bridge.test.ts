import { expect, it } from 'vitest';
import { MAX_HTML_PREVIEW_TEXT_CHARS, htmlPreviewHostDocument } from './html-preview-bridge';
import { htmlPreviewDocument } from './html-preview-policy';
import { themedSvgBytes } from './html-preview-theme';

const theme = {
  mode: 'dark' as const,
  variables: { '--foreground': '#eeeeee', '--background': '#111111' },
};

it('admits only its nonce-authorized bridge in a sanitized static preview', () => {
  const original =
    '<h1>Diagram</h1><svg viewBox="0 0 100 50"><path d="M0 0L100 50"/></svg><script>window.bad = 1</script>';
  const html = htmlPreviewHostDocument(htmlPreviewDocument(original), 'frame-1', theme);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  expect(doc.querySelectorAll('script')).toHaveLength(1);
  const nonce = doc.querySelector('script')!.getAttribute('nonce');
  expect(doc.querySelector('meta[http-equiv]')!.getAttribute('content')).toContain(
    `script-src 'nonce-${nonce}'`,
  );
  expect(html).not.toContain('window.bad');
  expect(html).toContain('frame-1');
  expect(doc.documentElement.classList.contains('dark')).toBe(true);
  expect(doc.querySelector('style')!.textContent).toContain('--foreground: #eeeeee');
});

it('adds a bounded rendered-text reply to the nonce bridge without changing the sandbox contract', () => {
  const html = htmlPreviewHostDocument('<body><h1>Rendered</h1></body>', 'copy-channel', theme);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const script = doc.querySelector('script')?.textContent ?? '';

  expect(script).toContain('clio.html-preview.read-text');
  expect(script).toContain('document.body?.innerText');
  expect(script).toContain('clio.html-preview.text-error');
  expect(script).toContain(String(MAX_HTML_PREVIEW_TEXT_CHARS));
  expect(doc.querySelector('script')?.getAttribute('nonce')).toBeTruthy();
});

it('themes a standalone SVG display copy while retaining authored colors and source bytes', () => {
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect fill="var(--primary)" width="100" height="50"/><text fill="red">Keep</text></svg>';
  const bytes = new TextEncoder().encode(source);
  const copy = new TextDecoder().decode(themedSvgBytes(bytes, theme));
  expect(copy).toContain('--foreground: #eeeeee');
  expect(copy).toContain('fill="red"');
  expect(copy).toContain('fill="var(--primary)"');
  expect(copy).toContain('width="100"');
  expect(copy).toContain('height="50"');
  expect(new TextDecoder().decode(bytes)).toBe(source);
  const invalid = new TextEncoder().encode('<not-svg>');
  expect(themedSvgBytes(invalid, theme)).toBe(invalid);
  const fixed = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="40" fill="red" color="blue"/>',
  );
  const fixedDoc = new DOMParser().parseFromString(
    new TextDecoder().decode(themedSvgBytes(fixed, theme)),
    'image/svg+xml',
  );
  expect(fixedDoc.documentElement.getAttribute('width')).toBe('40');
  expect(fixedDoc.documentElement.hasAttribute('height')).toBe(false);
  expect(fixedDoc.documentElement.getAttribute('fill')).toBe('red');
  expect(fixedDoc.documentElement.getAttribute('color')).toBe('blue');
  const inherited = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" style="color:currentColor;background:var(--background)" color="inherit"><text fill="currentColor">Read me</text></svg>',
  );
  const adaptive = new DOMParser().parseFromString(
    new TextDecoder().decode(themedSvgBytes(inherited, theme)),
    'image/svg+xml',
  );
  expect(adaptive.documentElement.style.color).toBe('var(--foreground, currentColor)');
  expect(adaptive.documentElement.getAttribute('color')).toBe('var(--foreground, currentColor)');
  expect(adaptive.documentElement.style.background).toBe('var(--background)');
  expect(new TextDecoder().decode(inherited)).toContain('color:currentColor');
});
