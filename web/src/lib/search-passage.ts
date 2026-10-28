import { rangeFromTextOffsets } from './attention-highlight-dom';
import { searchMatchRanges } from './search-matches';

/** Follow a mounted or virtualized passage, painting actual text without changing Markdown DOM. */
export function highlightSearchPassage(
  container: HTMLElement,
  messageId: string,
  partId: string | null,
  query: string,
): () => void {
  const name = `clio-search-${crypto.randomUUID()}`;
  let focusFrames = 0;
  let readerMoved = false;
  let frame = 0;
  const paint = () => {
    const message = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]')).filter(
      (node) => node.dataset.messageId === messageId,
    );
    const elements = partId
      ? message
          .flatMap((node) => [node, ...node.querySelectorAll<HTMLElement>('[data-part-id]')])
          .filter((node) => node.dataset.partId === partId)
      : message.filter((node) => !node.parentElement?.closest('[data-message-id]'));
    const unique = [...new Set(elements)].filter(
      (node, index, all) =>
        !all.some((parent, parentIndex) => parentIndex !== index && parent.contains(node)),
    );
    const ranges = unique.flatMap((node) =>
      searchMatchRanges(node.textContent ?? '', query).flatMap(([lo, hi]) => {
        const range = rangeFromTextOffsets(node, lo, hi);
        return range ? [range] : [];
      }),
    );
    if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined')
      CSS.highlights.set(name, new Highlight(...ranges));
    if (!readerMoved && focusFrames < 6 && ranges[0]) {
      focusFrames += 1;
      const parent = ranges[0].startContainer.parentElement;
      parent?.scrollIntoView({ block: 'center', inline: 'nearest' });
      const bounds = ranges[0].getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      container.scrollTop += bounds.top - viewport.top - viewport.height / 2;
      const messageRoot = parent?.closest<HTMLElement>('[id^="message-"]');
      messageRoot?.focus({ preventScroll: true });
      frame = requestAnimationFrame(paint);
    }
  };
  // Each mounted view owns its paint; no other conversation's highlights are cleared.
  const style = document.createElement('style');
  style.textContent = `::highlight(${name}) { background-color: var(--highlight); color: var(--highlight-foreground); }`;
  document.head.append(style);
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(paint);
  });
  observer.observe(container, { subtree: true, childList: true, characterData: true });
  const stopFocus = () => {
    readerMoved = true;
  };
  container.addEventListener('wheel', stopFocus, { passive: true });
  container.addEventListener('touchstart', stopFocus, { passive: true });
  container.addEventListener('keydown', stopFocus);
  frame = requestAnimationFrame(paint);
  return () => {
    observer.disconnect();
    container.removeEventListener('wheel', stopFocus);
    container.removeEventListener('touchstart', stopFocus);
    container.removeEventListener('keydown', stopFocus);
    cancelAnimationFrame(frame);
    if (typeof CSS !== 'undefined') CSS.highlights?.delete(name);
    style.remove();
  };
}
