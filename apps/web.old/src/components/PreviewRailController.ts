/**
 * Controller for Preview Rail: imperative glue/effects wiring the component to its model.
 */
import { createEffect, createMemo, createSignal, onMount, type Accessor } from 'solid-js';
import { getHljs, hljsSync } from '../hljs-lazy.js';
import {
  createPreviewRailResources,
  type PreviewRailClient,
} from './PreviewRailData.js';
import {
  buildTree,
  classifyPreview,
  decodeText,
  findTreeNode,
  flattenVisible,
  highlightedPreviewHtml,
  isMarkdownPreviewPath,
  normalizePath,
  previewDataUrl,
  type PreviewKind,
  type TreeNode,
} from './PreviewRailModel.js';

export interface PreviewRailControllerProps {
  workspaceId: Accessor<string | undefined>;
  client: PreviewRailClient;
  externalPath?: Accessor<string | undefined>;
}

export function createPreviewRailController(props: PreviewRailControllerProps) {
  const [filter, setFilter] = createSignal('');
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const [selected, setSelected] = createSignal<string>('');
  const [imageLoadFailed, setImageLoadFailed] = createSignal(false);

  // highlight.js loads lazily; flip this once it's ready to re-run the
  // highlight memo (plain escaped text renders until then — no blank flash).
  const [hljsReady, setHljsReady] = createSignal(hljsSync() !== null);
  onMount(() => {
    if (hljsSync()) return;
    void getHljs().then(() => setHljsReady(true));
  });

  const resources = createPreviewRailResources({
    workspaceId: props.workspaceId,
    selected,
    client: props.client,
  });

  const listing = resources.listing;
  const refetchListing = resources.refetchListing;
  const listError = resources.listError;
  const content = resources.content;
  const fileContent = resources.fileContent;
  const readError = resources.readError;
  const tree = createMemo(() => buildTree(listing()?.entries ?? []));
  const rows = createMemo(() => flattenVisible(tree(), expanded(), filter()));

  // External selection (Inspector context-file click): adopt it.
  createEffect(() => {
    const ext = props.externalPath?.();
    if (ext) setSelected(normalizePath(ext));
  });

  function toggleDir(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function onRowClick(node: TreeNode) {
    if (node.type === 'dir') toggleDir(node.path);
    else {
      setImageLoadFailed(false);
      setSelected(node.path);
    }
  }

  const kind = createMemo<PreviewKind | null>(() => {
    const c = fileContent();
    return c ? classifyPreview(c) : null;
  });

  const selectedNode = createMemo(() => findTreeNode(tree(), selected()));

  const dataUrl = createMemo(() => previewDataUrl(fileContent(), kind()));

  createEffect(() => {
    void dataUrl();
    setImageLoadFailed(false);
  });

  const textBody = createMemo(() => {
    const c = fileContent();
    if (!c || kind() !== 'text') return '';
    return decodeText(c);
  });

  const highlighted = createMemo(() => {
    if (kind() !== 'text') return null;
    const c = fileContent();
    if (!c) return null;
    const src = textBody();
    void hljsReady(); // dependency
    return highlightedPreviewHtml(kind(), c, src, hljsSync());
  });
  const isMarkdownPreview = createMemo(() => isMarkdownPreviewPath(selected()));

  return {
    filter,
    setFilter,
    expanded,
    selected,
    imageLoadFailed,
    setImageLoadFailed,
    listing,
    refetchListing,
    listError,
    content,
    fileContent,
    readError,
    rows,
    onRowClick,
    kind,
    selectedNode,
    dataUrl,
    textBody,
    highlighted,
    isMarkdownPreview,
  };
}
