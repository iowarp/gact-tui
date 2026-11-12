import { cjk } from '@streamdown/cjk';
import { type ComponentProps, type CSSProperties, useEffect, useRef, useState } from 'react';
import { defaultRemarkPlugins, Streamdown, type ExtraProps } from 'streamdown';
import { ExternalLink } from '@/components/ui/external-link';
import { deferredModule } from '@/lib/deferred-chunk';
import { pendingMathPlugin } from '@/lib/pending-math';
import {
  normalizeMathMarkdown,
  parseMathMarkdownBlocks,
  remarkStandardMath,
} from '@/lib/remark-standard-math';
import { cn } from '@/lib/utils';

type MathPlugin = typeof import('@streamdown/math').math;

// KaTeX is most of the markdown renderer's weight and most text has no math, so it
// loads when the first text with math syntax renders (or while the app is idle).
// Until then each formula is a faint box of about its size, never its TeX source.
const mathChunk = deferredModule(() => import('@streamdown/math').then((module) => module.math));
const MATH_SYNTAX = /\$|\\[([]|\\begin\{/u;
const pendingPlugins = { cjk, math: pendingMathPlugin };
let mathPlugins: { cjk: typeof cjk; math: MathPlugin } | undefined;

function useMathPlugins(needed: boolean) {
  const [math, setMath] = useState(() => mathChunk.loaded());
  useEffect(() => {
    if (!needed || math) return;
    let current = true;
    mathChunk.load().then(
      (plugin) => {
        if (current) setMath(plugin);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [needed, math]);
  if (!math) return pendingPlugins;
  mathPlugins ??= { cjk, math };
  return mathPlugins;
}

/**
 * Streamdown's own default anchor is a plain `target="_blank"` `<a>` â€” the
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

const streamdownComponents = { a: MarkdownLink, ol: MarkdownOrderedList };

/**
 * Streamdown's ordered list, plus the digit count of its widest marker
 * (`start` + items âˆ’ 1). An outside "100." needs a wider gutter than "9.",
 * and CSS can't add a `start` attribute to an item count.
 */
function MarkdownOrderedList({
  className,
  node,
  start,
  style,
  ...props
}: ComponentProps<'ol'> & ExtraProps) {
  const items = node?.children.filter(
    (child) => child.type === 'element' && child.tagName === 'li',
  ).length;
  const first = typeof start === 'number' && Number.isFinite(start) ? start : 1;
  const digits = String(Math.abs(Math.trunc(Math.max(first, first + (items ?? 1) - 1)))).length;
  return (
    <ol
      {...props}
      className={cn('list-inside list-decimal whitespace-normal', className)}
      data-marker-digits={digits > 1 ? digits : undefined}
      data-streamdown="ordered-list"
      start={start}
      style={digits > 1 ? ({ ...style, '--marker-digits': digits } as CSSProperties) : style}
    />
  );
}

export function MarkdownText({
  components,
  remarkPlugins,
  ...props
}: ComponentProps<typeof Streamdown>) {
  const markdown =
    typeof props.children === 'string' ? normalizeMathMarkdown(props.children) : props.children;
  const plugins = useMathPlugins(typeof markdown !== 'string' || MATH_SYNTAX.test(markdown));
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
        // Streamdown memoises blocks by content, so math arriving needs one remount.
        key={plugins === pendingPlugins ? 'pending' : 'math'}
        components={{ ...streamdownComponents, ...components }}
        plugins={plugins}
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
