import { cjk } from '@streamdown/cjk';
import { math } from '@streamdown/math';
import { type ComponentProps, useEffect, useRef } from 'react';
import { Streamdown } from 'streamdown';

const streamdownPlugins = { cjk, math };

export function MarkdownText(props: ComponentProps<typeof Streamdown>) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const labelTitleOnlyControls = () => {
      for (const button of root.querySelectorAll<HTMLButtonElement>(
        'button[title]:not([aria-label])',
      )) {
        if (button.textContent?.trim()) continue;
        const title = button.title.trim();
        if (title) button.setAttribute('aria-label', title);
      }
    };

    labelTitleOnlyControls();
    const observer = new MutationObserver(labelTitleOnlyControls);
    observer.observe(root, {
      attributeFilter: ['title'],
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="contents" ref={rootRef}>
      <Streamdown plugins={streamdownPlugins} {...props} />
    </div>
  );
}
