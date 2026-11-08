import { lazy, useState } from 'react';

export type MarkdownTextComponent = typeof import('./markdown').MarkdownText;

let pending: Promise<MarkdownTextComponent> | undefined;
let loaded: MarkdownTextComponent | undefined;

/**
 * Starts loading the markdown renderer once. Message text renders as plain
 * text until it arrives and then reflows into formatted markdown, so the
 * transcript requests it as early as possible, not when its first row mounts.
 */
export function loadMarkdownText(): Promise<MarkdownTextComponent> {
  pending ??= import('./markdown').then((module) => {
    loaded = module.MarkdownText;
    return loaded;
  });
  return pending;
}

const LazyMarkdownText = lazy(() =>
  loadMarkdownText().then((component) => ({ default: component })),
);

/**
 * The renderer for this mount, chosen once so it never remounts: the loaded
 * module when available, since `lazy()` suspends on every first mount and
 * React holds a revealed fallback for up to 300 ms, otherwise the lazy wrapper.
 */
export function useMarkdownText(): MarkdownTextComponent {
  const [component] = useState<MarkdownTextComponent>(
    () => loaded ?? (LazyMarkdownText as unknown as MarkdownTextComponent),
  );
  return component;
}
