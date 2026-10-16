const LIBRARY_ORIGINS =
  'https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://cdnjs.cloudflare.com https://cdn.babylonjs.com';

/** Recognize authored scripts and event handlers without running them in CLIO. */
export function hasHtmlScripts(content: string): boolean {
  return /<script\b|\son\w+\s*=/iu.test(content);
}

/** Prepare an opaque scripted frame; source is never inserted into the app DOM. */
export async function interactiveHtmlDocument(content: string): Promise<string> {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  // Author metadata cannot replace our policy or navigate the frame on a timer.
  doc
    .querySelectorAll('base,meta[http-equiv],iframe,frame,frameset,object,embed')
    .forEach((node) => node.remove());
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'wasm-unsafe-eval' blob: ${LIBRARY_ORIGINS}`,
    `style-src 'unsafe-inline' ${LIBRARY_ORIGINS}`,
    'img-src data: blob: https:',
    `font-src data: ${LIBRARY_ORIGINS}`,
    'media-src data: blob:',
    'worker-src blob:',
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  doc.head.prepend(policy);
  if (/\bTHREE\b|['"]three(?:\/|['"])/u.test(content)) {
    const { threePreviewBootstrap } = await import('./html-preview-three');
    const bootstrap = doc.createElement('script');
    bootstrap.textContent = threePreviewBootstrap().replace(/<\/script/giu, '<\\/script');
    policy.after(bootstrap);
  }
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
