import type { KnowledgeNote } from '@clio/core/v3';

export const WIKI_NOTE_LINK = '/__clio_knowledge_note__/';
const WIKI_LINK = /!?\[\[([^[\]\n]+?)\]\]/gu;

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MarkdownNode[];
}

function wikiNodes(value: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let last = 0;
  for (const match of value.matchAll(WIKI_LINK)) {
    const [whole, inner] = match;
    const index = match.index ?? 0;
    const bar = inner.indexOf('|');
    const target = (bar < 0 ? inner : inner.slice(0, bar)).trim();
    const label = (bar < 0 ? '' : inner.slice(bar + 1).trim()) || target;
    if (!label) continue;
    if (index > last) nodes.push({ type: 'text', value: value.slice(last, index) });
    nodes.push({
      type: 'link',
      url: WIKI_NOTE_LINK + encodeURIComponent(target),
      title: null,
      children: [{ type: 'text', value: label }],
    });
    last = index + whole.length;
  }
  if (!nodes.length) return [{ type: 'text', value }];
  if (last < value.length) nodes.push({ type: 'text', value: value.slice(last) });
  return nodes;
}

/** `[[target]]`, `[[target|alias]]` and `![[embed]]` in prose become note links; code stays literal. */
export function remarkKnowledgeWikiLinks() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children || node.type === 'link' || node.type === 'linkReference') return;
      const children: MarkdownNode[] = [];
      for (const child of node.children) {
        if (child.type === 'text' && child.value?.includes('[[')) {
          children.push(...wikiNodes(child.value));
        } else {
          visit(child);
          children.push(child);
        }
      }
      node.children = children;
    };
    visit(tree);
  };
}

export interface KnowledgeNoteRef {
  path: string;
  title: string;
}

function basename(path: string) {
  return path.split('/').at(-1) ?? path;
}

/** A note's name: its indexed title, else its file name without `.md`. */
export function knowledgeNoteName(path: string, titles?: ReadonlyMap<string, string>) {
  return titles?.get(path) ?? basename(path).replace(/\.md$/iu, '');
}

/**
 * Resolves wiki-link targets the way a vault does: by path, file name or
 * title, ignoring case, `.md` and any `#heading`/`^block` selector.
 */
export function knowledgeNoteResolver(
  current: KnowledgeNoteRef,
  notes: readonly (KnowledgeNoteRef & Pick<KnowledgeNote, 'aliases'>)[],
) {
  const index = new Map<string, KnowledgeNoteRef>();
  const add = (key: string, note: KnowledgeNoteRef) => {
    const normalized = key.trim().toLowerCase();
    if (normalized && !index.has(normalized)) index.set(normalized, note);
  };
  const all = [current, ...notes.map((note) => ({ path: note.path, title: note.title }))];
  for (const note of all) {
    add(note.path, note);
    add(note.path.replace(/\.md$/iu, ''), note);
  }
  for (const note of all) {
    add(basename(note.path), note);
    add(basename(note.path).replace(/\.md$/iu, ''), note);
    add(note.title, note);
  }
  for (const note of notes)
    for (const alias of note.aliases ?? []) add(alias, { path: note.path, title: note.title });
  return (target: string): KnowledgeNoteRef | undefined => {
    const name = target
      .split(/[#^]/u)[0]
      .trim()
      .replace(/\\/gu, '/')
      .replace(/^\.?\//u, '');
    if (!name) return current;
    return index.get(name.toLowerCase()) ?? index.get(`${name}.md`.toLowerCase());
  };
}
