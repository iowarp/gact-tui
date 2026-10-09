import createDOMPurify from 'dompurify';

const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Recognize HTML by its registered type or ordinary file extension. */
export function isHtmlFile(name: string, mediaType = ''): boolean {
  return (
    mediaType.split(';', 1)[0]?.trim().toLowerCase() === 'text/html' || /\.html?$/iu.test(name)
  );
}

/** Build an isolated, self-contained display copy without altering the original source. */
export function htmlPreviewDocument(content: string): string {
  const purifier = createDOMPurify(window);
  if (!purifier.isSupported) throw new Error('This browser cannot prepare an HTML preview.');
  // Preserve local SVG references and embedded media, but never make file links
  // navigable or resolve their relative URLs against CLIO's connected service.
  purifier.addHook('uponSanitizeAttribute', (node, attribute) => {
    if (['href', 'xlink:href'].includes(attribute.attrName)) {
      attribute.keepAttr =
        attribute.attrValue.startsWith('#') ||
        (node.nodeName.toLowerCase() === 'image' && /^data:image\//iu.test(attribute.attrValue));
    } else if (['src', 'poster'].includes(attribute.attrName)) {
      attribute.keepAttr = /^data:(?:image|audio|video)\//iu.test(attribute.attrValue);
    }
  });
  const html = purifier.sanitize(content, {
    WHOLE_DOCUMENT: true,
    RETURN_DOM: true,
    ADD_TAGS: ['style', 'use'],
    FORBID_TAGS: [
      'script',
      'iframe',
      'frame',
      'frameset',
      'object',
      'embed',
      'link',
      'base',
      'meta',
    ],
    FORBID_ATTR: ['srcset', 'action', 'formaction', 'target', 'ping'],
  });
  if (!(html instanceof Element) || !html.ownerDocument) {
    throw new Error('Could not prepare the HTML document.');
  }
  const head = html.querySelector('head');
  if (!head) throw new Error('The HTML preview has no document head.');
  const charset = html.ownerDocument.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  const policy = html.ownerDocument.createElement('meta');
  policy.setAttribute('http-equiv', 'Content-Security-Policy');
  policy.setAttribute('content', PREVIEW_CSP);
  const defaults = html.ownerDocument.createElement('style');
  defaults.textContent = 'html { color-scheme: light; } body { background: white; color: black; }';
  // Only fixed host-owned metadata is added after sanitization. The policy is
  // first, before any author CSS; author styles can still choose their own theme.
  head.prepend(charset, policy, defaults);
  return `<!doctype html>\n${html.outerHTML}`;
}
