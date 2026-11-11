/**
 * Mount CSS that only exists at runtime (dynamic ::highlight() names, rules kept
 * off while unused) through a constructable stylesheet. The desktop CSP adds a
 * nonce to style-src, so a runtime <style> element is blocked there; CSSOM
 * sheets are not. Returns a function that unmounts the rules.
 */
export function adoptStyleSheet(cssText: string, marker: string): () => void {
  if ('adoptedStyleSheets' in Document.prototype && 'replaceSync' in CSSStyleSheet.prototype) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((entry) => entry !== sheet);
    };
  }
  // Engines without constructable sheets (and jsdom) also have no nonce CSP to satisfy.
  const style = document.createElement('style');
  style.setAttribute(`data-${marker}`, '');
  style.textContent = cssText;
  document.head.append(style);
  return () => style.remove();
}
