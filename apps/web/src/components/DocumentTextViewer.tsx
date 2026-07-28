import { createEffect, type JSX } from 'solid-js';
import type { DocumentAnchor } from '@clio/core';

interface DocumentTextViewerProps {
  html?: string;
  children?: JSX.Element;
  profile: 'markdown' | 'html-static' | 'latex';
  sourcePath: string;
  onSelection: (anchor: DocumentAnchor, rect: DOMRect) => void;
}

const FORBIDDEN = [
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'meta[http-equiv]',
  'base',
  'animate',
  'animateMotion',
  'animateTransform',
  'discard',
  'set',
];

const NETWORK_ATTRIBUTES = new Set([
  'action',
  'background',
  'cite',
  'data',
  'formaction',
  'manifest',
  'ping',
  'poster',
  'src',
  'srcset',
]);

function unsafeCss(value: string): boolean {
  return /(?:@import|url\s*\(|image-set\s*\(|expression\s*\(|behavior\s*:|-moz-binding\s*:)/i.test(
    value,
  );
}

export function sanitizeStaticDocumentHtml(source: string): string {
  const documentValue = new DOMParser().parseFromString(source, 'text/html');
  for (const node of documentValue.querySelectorAll(FORBIDDEN.join(','))) node.remove();
  for (const style of documentValue.querySelectorAll('style')) {
    if (unsafeCss(style.textContent ?? '')) style.remove();
  }
  for (const element of documentValue.querySelectorAll('*')) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith('on') ||
        name === 'srcdoc' ||
        name === 'target' ||
        NETWORK_ATTRIBUTES.has(name) ||
        value.startsWith('javascript:') ||
        unsafeCss(value) ||
        ((name === 'href' || name === 'xlink:href') && !value.startsWith('#'))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  const headStyles = Array.from(documentValue.head.querySelectorAll('style'))
    .map((style) => style.outerHTML)
    .join('');
  return headStyles + documentValue.body.innerHTML;
}

function contextForRange(root: Node, range: Range) {
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(root);
  after.setStart(range.endContainer, range.endOffset);
  return {
    prefix: before.toString().slice(-96),
    suffix: after.toString().slice(0, 96),
  };
}

function selectorFor(node: Element | null): string {
  if (!node) return '';
  if (node.id) return `#${CSS.escape(node.id)}`;
  const parts: string[] = [];
  let current: Element | null = node;
  while (current && parts.length < 5 && current.tagName.toLowerCase() !== 'body') {
    const tag = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (candidate) => candidate.tagName === current!.tagName,
        )
      : [];
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

export function DocumentTextViewer(props: DocumentTextViewerProps) {
  let root: HTMLDivElement | undefined;

  createEffect(() => {
    const html = props.html ?? '';
    if (props.profile !== 'html-static' || !root) return;
    const shadow = root.shadowRoot ?? root.attachShadow({ mode: 'open' });
    shadow.innerHTML = html;
  });

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !root) return;
    const range = selection.getRangeAt(0);
    const selectionRoot: Node =
      props.profile === 'html-static' && root.shadowRoot ? root.shadowRoot : root;
    if (!selectionRoot.contains(range.commonAncestorContainer)) return;
    const exact = selection.toString().trim();
    if (!exact) return;
    const context = contextForRange(selectionRoot, range);
    const element =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;
    props.onSelection(
      props.profile === 'html-static'
        ? {
            profile: 'dom',
            exact,
            prefix: context.prefix,
            suffix: context.suffix,
            selector: selectorFor(element),
            stable_id: element?.id ?? '',
            source_path: props.sourcePath,
          }
        : {
            profile: props.profile === 'latex' ? 'source-map' : 'text-quote',
            exact,
            prefix: context.prefix,
            suffix: context.suffix,
            source_path: props.sourcePath,
          },
      range.getBoundingClientRect(),
    );
  }

  return (
    <div
      ref={(element) => {
        root = element;
        if (props.profile === 'html-static') {
          const shadow = root.shadowRoot ?? root.attachShadow({ mode: 'open' });
          shadow.innerHTML = props.html ?? '';
        }
      }}
      class="document-text-viewer"
      data-testid={`document-${props.profile}`}
      innerHTML={props.profile === 'html-static' ? undefined : props.html}
      onMouseUp={captureSelection}
      onClick={(event) => {
        if (event.composedPath().some((node) => node instanceof HTMLAnchorElement)) {
          event.preventDefault();
        }
      }}
    >
      {props.profile === 'html-static' ? undefined : props.children}
    </div>
  );
}
