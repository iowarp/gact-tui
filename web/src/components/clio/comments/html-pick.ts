import type { DocumentAnchor } from '@clio/core/v3';
import { createContext } from 'react';

/**
 * What the comment session asks of an HTML preview frame: pick an element, or report a text
 * selection, through the picker script in the frame's host script (comments plan, "The
 * element picker"; rule 5, frames stay opaque).
 */
export interface HtmlPick {
  mode?: 'element' | 'text';
  /** Characters of a picked element's HTML to keep (comments.html_excerpt_chars). */
  htmlChars: number;
  onPick: (anchor: DocumentAnchor) => void;
}

export const HtmlPickContext = createContext<HtmlPick | undefined>(undefined);

const MAX_TEXT = 4_000;

function text(value: unknown, limit: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, limit) : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A `pick.selected` report from the frame as a `dom` anchor, or undefined when malformed. */
export function elementAnchor(data: Record<string, unknown>, htmlChars: number): DocumentAnchor | undefined {
  const selector = text(data.selector, 1_000);
  const tag = text(data.tag, 64);
  const rect = Array.isArray(data.rect) ? data.rect.map(finite) : [];
  if (!selector || !tag || rect.length !== 4 || rect.some((value) => value === undefined)) return undefined;
  return {
    profile: 'dom',
    selector,
    tag,
    text_excerpt: text(data.text, MAX_TEXT),
    html_excerpt: text(data.html, htmlChars),
    rect: rect as number[],
    viewport_width: finite(data.viewport),
  };
}

/** A `selection` report from the frame as a `text-quote` anchor, or undefined. */
export function selectionAnchor(data: Record<string, unknown>): DocumentAnchor | undefined {
  const exact = text(data.exact, MAX_TEXT)?.trim();
  if (!exact) return undefined;
  return {
    profile: 'text-quote',
    exact,
    prefix: text(data.prefix, 64),
    suffix: text(data.suffix, 64),
    start: finite(data.start),
    end: finite(data.end),
  };
}

/** The picker that joins the frame's host script (`html-preview-bridge.ts`). */
export function pickerScript(): string {
  return `
    let pickMode = '', pickBox = null, htmlChars = 400;
    const pickPath = (el) => {
      if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
      for (const name of ['data-testid', 'data-id', 'name']) {
        const value = el.getAttribute && el.getAttribute(name);
        if (value) {
          const candidate = el.tagName.toLowerCase() + '[' + name + '="' + CSS.escape(value) + '"]';
          if (document.querySelectorAll(candidate).length === 1) return candidate;
        }
      }
      const parts = [];
      for (let node = el; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
        if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
        const tag = node.tagName.toLowerCase();
        const same = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : [];
        parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(node) + 1) + ')' : tag);
        const selector = parts.join(' > ');
        if (document.querySelectorAll(selector).length === 1) return selector;
      }
      return parts.join(' > ');
    };
    const outline = (el) => {
      if (!pickBox) {
        pickBox = document.createElement('div');
        pickBox.style.cssText = 'position:absolute;pointer-events:none;z-index:2147483647;outline:2px solid var(--primary, Highlight);outline-offset:1px';
        document.documentElement.appendChild(pickBox);
      }
      const r = el.getBoundingClientRect();
      Object.assign(pickBox.style, {display: 'block', left: (r.left + scrollX) + 'px', top: (r.top + scrollY) + 'px', width: r.width + 'px', height: r.height + 'px'});
    };
    const stopPick = () => { pickMode = ''; if (pickBox) pickBox.style.display = 'none'; };
    addEventListener('mouseover', (event) => { if (pickMode === 'element' && event.target instanceof Element) outline(event.target); }, true);
    addEventListener('click', (event) => {
      if (pickMode !== 'element' || !(event.target instanceof Element)) return;
      event.preventDefault(); event.stopPropagation();
      const el = event.target, r = el.getBoundingClientRect();
      parent.postMessage({type: 'clio.html-preview.pick.selected', channel, selector: pickPath(el),
        tag: el.tagName.toLowerCase(), text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 4000),
        html: el.outerHTML.slice(0, htmlChars), rect: [r.left + scrollX, r.top + scrollY, r.width, r.height],
        viewport: innerWidth}, '*');
    }, true);
    addEventListener('mouseup', () => {
      if (pickMode !== 'text') return;
      const selection = getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const range = selection.getRangeAt(0), body = document.body;
      const before = document.createRange(); before.selectNodeContents(body); before.setEnd(range.startContainer, range.startOffset);
      const after = document.createRange(); after.selectNodeContents(body); after.setStart(range.endContainer, range.endOffset);
      const squash = (value) => value.replace(/\\s+/g, ' ');
      const prefix = squash(before.toString()), exact = squash(range.toString()).trim();
      if (!exact) return;
      parent.postMessage({type: 'clio.html-preview.selection', channel, exact: exact.slice(0, 4000),
        prefix: prefix.slice(-64), suffix: squash(after.toString()).slice(0, 64),
        start: prefix.length, end: prefix.length + exact.length}, '*');
      selection.removeAllRanges();
    }, true);
    addEventListener('message', (event) => {
      const data = event.data;
      if (event.source !== parent || data?.channel !== channel) return;
      if (data.type === 'clio.html-preview.pick.start' && ['element', 'text'].includes(data.mode)) {
        pickMode = data.mode; htmlChars = Math.max(50, Math.min(8000, Number(data.htmlChars) || 400));
      } else if (data.type === 'clio.html-preview.pick.cancel') stopPick();
    });`;
}
