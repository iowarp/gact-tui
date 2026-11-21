import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, CopyIcon, PanelRightIcon, WrapTextIcon, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { IconButton } from './primitives/icon-button';
import { AskButton, AskKeyChip, AskSection } from './ask-card';
import { askKeyAttributes } from './ask-card-keys';
import { jsonLine, useHighlightedLines, WRAP_MARKS } from './ask-code-lines';
import { plural, t } from '@lingui/core/macro';

const PREVIEW_LINES = 8;

function AskCopyButton({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <TooltipProvider>
      <IconButton
        className="text-muted-foreground"
        icon={copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        label={copied ? t`Copied` : label}
        onClick={() => {
          void copyText(code).then(
            () => setCopied(true),
            () => toast.error(t`Could not copy to the clipboard.`),
          );
        }}
        size="sm"
        variant="ghost"
      />
    </TooltipProvider>
  );
}

/**
 * Code the reader approves: line numbers, long lines wrapped so nothing hides
 * past the right edge. Past eight lines the rest fades; O shows it all.
 */
export function AskCode({
  code,
  label,
  name,
  meta,
  onOpen,
  openLabel = t`Open in tab`,
  copyLabel,
  icon: NameIcon,
  wrapToggle,
  language,
  previewLines = PREVIEW_LINES,
  className,
}: {
  code: string;
  /** Accessible name of the block. */
  label: string;
  /** A header: file name and a muted line ("Python, 64 lines"). */
  name?: string;
  meta?: string;
  /** Opens the whole code elsewhere; without it, O expands it here. */
  onOpen?: () => void;
  openLabel?: string;
  /** Adds a copy button to the header, named by this label. */
  copyLabel?: string;
  /** A file-type glyph before the name. */
  icon?: LucideIcon;
  /** Adds a header toggle for wrapping long lines (on by default). */
  wrapToggle?: boolean;
  language?: 'json' | 'python';
  previewLines?: number;
  className?: string;
}) {
  const lines = code.replace(/\n$/u, '').split('\n');
  const [expanded, setExpanded] = useState(false);
  const [wrap, setWrap] = useState(true);
  const clipped = !expanded && lines.length > previewLines;
  const shown = clipped ? lines.slice(0, previewLines) : lines;
  // A cap can shrink the preview below its lines, so the footer counts what is really hidden:
  // lines past the block's visible bottom, a partly cut line included.
  const preRef = useRef<HTMLPreElement>(null);
  const [fitting, setFitting] = useState<number>();
  useLayoutEffect(() => {
    const pre = preRef.current;
    if (!pre || !clipped) {
      setFitting(undefined);
      return;
    }
    const update = () => {
      // Folded (no room for a line), every line is hidden.
      if (pre.getClientRects().length === 0) {
        setFitting(0);
        return;
      }
      const bottom = pre.getBoundingClientRect().top + pre.clientHeight + 0.5;
      let count = 0;
      for (const line of pre.querySelectorAll('code')) {
        if (line.getBoundingClientRect().bottom > bottom) break;
        count += 1;
      }
      setFitting(count);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(pre);
    return () => observer?.disconnect();
  }, [clipped, code, wrap]);
  const hidden = lines.length - (clipped ? (fitting ?? shown.length) : lines.length);
  const highlighted = useHighlightedLines(code, language);
  const lineContent = (line: string, index: number): ReactNode => {
    if (!line) return ' ';
    // Every block shares the highlighter's palette; JSON reads in its own tones until it loads.
    const tokens = highlighted?.[index];
    if (!tokens) return language === 'json' ? jsonLine(line) : line;
    return tokens.map((token, at) => (
      <span key={at} style={{ color: token.color }}>
        {token.content}
      </span>
    ));
  };
  return (
    <AskSection
      aria-label={label}
      className={cn(
        'shrink-0 overflow-hidden rounded-lg border border-border bg-background',
        className,
      )}
      data-slot="ask-code"
      role="group"
    >
      {name ? (
        <div className="flex h-[30px] min-w-0 shrink-0 items-center gap-2 border-b border-border pr-1 pl-2.5 text-label whitespace-nowrap text-muted-foreground">
          {NameIcon ? <NameIcon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
          <span className="truncate text-meta font-medium text-foreground/90">{name}</span>
          {meta ? <span className="truncate">{meta}</span> : null}
          <span className="flex-1" />
          {wrapToggle ? (
            <TooltipProvider>
              <IconButton
                className="text-muted-foreground"
                icon={<WrapTextIcon aria-hidden="true" />}
                label={wrap ? t`Stop wrapping long lines` : t`Wrap long lines`}
                onClick={() => setWrap((value) => !value)}
                size="sm"
                variant="ghost"
              />
            </TooltipProvider>
          ) : null}
          {copyLabel ? <AskCopyButton code={code} label={copyLabel} /> : null}
        </div>
      ) : null}
      <pre
        ref={preRef}
        className={cn(
          'clio-scrollbar grid min-h-0 grid-cols-[34px_minmax(0,1fr)] py-1.5 pr-2.5 font-mono text-label leading-[1.65] text-foreground/90 in-data-code-folded:hidden',
          clipped
            ? 'max-h-[140px] overflow-y-hidden [mask-image:linear-gradient(#000_62%,transparent)]'
            : 'max-h-[min(24rem,40dvh)] overflow-y-auto',
          wrap ? 'overflow-x-hidden' : 'overflow-x-auto',
        )}
        tabIndex={clipped ? undefined : 0}
      >
        {shown.map((line, index) => (
          <span className="contents" key={index}>
            <span aria-hidden="true" className="relative pr-3 text-right text-faint select-none">
              {index + 1}
              {wrap ? (
                // ↪ on each continuation row a wrapped line takes, as the spec's gutter shows.
                <span
                  className="absolute inset-x-0 top-[1.65em] bottom-0 bg-warning"
                  data-slot="ask-code-wrap-marks"
                  style={WRAP_MARKS}
                />
              ) : null}
            </span>
            {/* Wraps at spaces; only a token wider than the block breaks inside. */}
            <code
              className={wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre'}
            >
              {lineContent(line, index)}
            </code>
          </span>
        ))}
      </pre>
      {hidden > 0 || onOpen ? (
        <div className="flex min-h-[30px] min-w-0 shrink-0 items-center gap-2.5 border-t border-border py-0.5 pr-1.5 pl-2.5 text-label whitespace-nowrap text-muted-foreground">
          {hidden > 0 ? (
            // Narrow, the count wraps whole rather than being cut.
            <span className="truncate @max-[420px]/ask:overflow-visible @max-[420px]/ask:whitespace-normal">
              {plural(hidden, { one: '# more line', other: '# more lines' })}
            </span>
          ) : null}
          <AskButton
            {...askKeyAttributes(['o'])}
            className="ml-auto h-6 max-w-full min-w-0 shrink px-2 text-meta @max-[420px]/ask:h-6 @max-[420px]/ask:min-h-0 @max-[420px]/ask:py-0"
            onClick={onOpen ?? (() => setExpanded(true))}
            title={onOpen ? openLabel : undefined}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {onOpen ? <PanelRightIcon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
              <span
                className={cn(
                  'min-w-0 truncate',
                  // Narrow, the icon, the O key and the tooltip carry it; the line count stays whole.
                  onOpen && '@max-[420px]/ask:sr-only',
                )}
              >
                {onOpen ? openLabel : t`Show all`}
              </span>
              <AskKeyChip askKey="o" />
            </span>
          </AskButton>
        </div>
      ) : null}
    </AskSection>
  );
}
