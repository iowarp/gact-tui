import { cjk } from '@streamdown/cjk';
import { math } from '@streamdown/math';
import { type ComponentProps, useEffect, useRef } from 'react';
import { defaultRemarkPlugins, Streamdown, type ExtraProps } from 'streamdown';
import { ExternalLink } from '@/components/ui/external-link';
import {
  normalizeMathMarkdown,
  parseMathMarkdownBlocks,
  remarkStandardMath,
} from '@/lib/remark-standard-math';
import { cn } from '@/lib/utils';

const streamdownPlugins = { cjk, math };

/**
 * Streamdown's own default anchor is a plain `target="_blank"` `<a>` — the
 * same one the desktop shell's opener plugin fails to intercept correctly
 * once its scope is narrower than the link (see `ExternalLink`). Overriding
 * `a` here routes every markdown link through the one path instead, without
 * requiring every caller of `MarkdownText` to opt in.
 */
function MarkdownLink({
  className,
  href,
  node: _node,
  ...props
}: ComponentProps<'a'> & ExtraProps) {
  if (!href) return <a {...props} />;
  return (
    <ExternalLink
      {...props}
      className={cn('wrap-anywhere font-medium text-link underline', className)}
      href={href}
    />
  );
}

const streamdownComponents = { a: MarkdownLink };

export function MarkdownText({
  components,
  remarkPlugins,
  ...props
}: ComponentProps<typeof Streamdown>) {
  const markdown =
    typeof props.children === 'string' ? normalizeMathMarkdown(props.children) : props.children;
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
      <Streamdown
        components={{ ...streamdownComponents, ...components }}
        plugins={streamdownPlugins}
        parseMarkdownIntoBlocksFn={parseMathMarkdownBlocks}
        remarkPlugins={[
          ...(remarkPlugins ?? Object.values(defaultRemarkPlugins)),
          remarkStandardMath,
        ]}
        {...props}
      >
        {markdown}
      </Streamdown>
    </div>
  );
}
