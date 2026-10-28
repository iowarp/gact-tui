import { themeVariablesCss, type HtmlPreviewTheme } from './html-preview-theme';
import { nanoid } from 'nanoid';

export const MAX_HTML_PREVIEW_TEXT_CHARS = 1_000_000;
export const HTML_PREVIEW_TEXT_TIMEOUT_MS = 5_000;

export type HtmlPreviewTextReader = () => Promise<string>;
export type HtmlPreviewTextReaderChange = (reader?: HtmlPreviewTextReader) => void;

/** Add a presentation-only bridge after authored static HTML has been sanitized. */
export function htmlPreviewHostDocument(
  html: string,
  channel: string,
  theme: HtmlPreviewTheme,
): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.documentElement.classList.toggle('dark', theme.mode === 'dark');
  const nonce = nanoid(24);
  const policy = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
  // Static authored content remains script-free. Only this fixed host script is admitted.
  if (policy?.getAttribute('content')?.includes("script-src 'none'")) {
    policy.setAttribute(
      'content',
      policy.getAttribute('content')!.replace("script-src 'none'", `script-src 'nonce-${nonce}'`),
    );
  }
  const defaults = doc.createElement('style');
  defaults.textContent = `${themeVariablesCss(theme)}
    html { font-size: var(--clio-font-size, 16px); }
    body { color: var(--foreground); background: var(--background); font-family: var(--font-sans, system-ui); display: flow-root; }
    :where(input, select, textarea, button) { font: inherit; color: inherit; border: 1px solid var(--border); border-radius: var(--radius, .4rem); background: var(--card); }
    :where(button, select) { cursor: pointer; }
    :where(a) { color: var(--primary, currentColor); }
    :where(code, pre) { font-family: var(--font-mono, monospace); }
    :where(body > svg:only-child) { display: block; max-width: 100%; height: auto; }
    :where(body > svg:only-child:not([color])) { color: var(--foreground, currentColor); }
    :where(body > svg:only-child:not([fill])) { fill: currentColor; }
    :where(body > svg[viewBox]:only-child:not([width])) { width: 100%; }
  `;
  // After the policy, before author styles: explicit author colors and layout win.
  if (policy) policy.after(defaults);
  else doc.head.prepend(defaults);
  const script = doc.createElement('script');
  script.setAttribute('nonce', nonce);
  script.textContent = bridgeScript(channel);
  doc.head.append(script);
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function bridgeScript(channel: string): string {
  return `(() => {
    const channel = ${JSON.stringify(channel).replace(/</gu, '\\u003c')};
    const maxTextChars = ${MAX_HTML_PREVIEW_TEXT_CHARS};
    let queued = false, previous = 0, lastViewport = 0, lastBody = 0, viewportLayout = false;
    const measure = () => {
      queued = false;
      const body = document.body;
      if (!body) return;
      const box = body.getBoundingClientRect(), css = getComputedStyle(body);
      let bottom = box.bottom;
      for (const child of body.children) bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
      // A full-viewport body plus default margins must not add those margins to
      // the iframe forever. Preserve an explicitly viewport-sized document.
      const followsViewport = lastViewport > 0 && innerHeight !== lastViewport &&
        Math.abs(box.height - innerHeight) < 1 &&
        Math.abs((box.height - lastBody) - (innerHeight - lastViewport)) < 1;
      viewportLayout = viewportLayout || followsViewport;
      lastViewport = innerHeight; lastBody = box.height;
      const viewport = (viewportLayout && Math.abs(box.height - innerHeight) < 1) ||
        (document.documentElement.getBoundingClientRect().height <= innerHeight + 1 && box.height >= innerHeight - 1);
      const height = viewport ? innerHeight : Math.ceil(Math.max(box.height, bottom - box.top) + (parseFloat(css.marginTop) || 0) + (parseFloat(css.marginBottom) || 0));
      if (height > 0 && height !== previous) {
        previous = height;
        parent.postMessage({type: 'clio.html-preview.height', channel, height}, '*');
      }
    };
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(measure); } };
    addEventListener('message', event => {
      const data = event.data;
      if (event.source === parent && data?.channel === channel &&
          data.type === 'clio.html-preview.read-text' && typeof data.requestId === 'string') {
        const text = document.body?.innerText ?? '';
        parent.postMessage(text.length <= maxTextChars
          ? {type: 'clio.html-preview.text', channel, requestId: data.requestId, text}
          : {type: 'clio.html-preview.text-error', channel, requestId: data.requestId, code: 'too-large'}, '*');
        return;
      }
      if (event.source !== parent || data?.type !== 'clio.html-preview.theme' || data.channel !== channel ||
          !['light', 'dark'].includes(data.theme?.mode) || !data.theme.variables || typeof data.theme.variables !== 'object') return;
      for (const [key, value] of Object.entries(data.theme.variables)) {
        if (/^--[a-z0-9-]+$/.test(key) && typeof value === 'string' && value.length < 1000) document.documentElement.style.setProperty(key, value);
      }
      document.documentElement.style.colorScheme = data.theme.mode;
      document.documentElement.classList.toggle('dark', data.theme.mode === 'dark');
      dispatchEvent(new CustomEvent('clio:theme-change', {detail: data.theme}));
      schedule();
    });
    const start = () => {
      new ResizeObserver(schedule).observe(document.body);
      new MutationObserver(schedule).observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true});
      addEventListener('resize', schedule);
      addEventListener('load', schedule, true);
      document.fonts?.ready.then(schedule);
      parent.postMessage({type: 'clio.html-preview.mounted', channel}, '*');
      schedule();
    };
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start, {once: true}); else start();
  })();`;
}
