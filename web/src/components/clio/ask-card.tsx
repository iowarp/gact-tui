import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  MinusIcon,
  OctagonMinusIcon,
  PanelRightIcon,
  WrapTextIcon,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { ActivityDisclosure, ActivityRow } from './activity-row';
import { IconButton } from './primitives/icon-button';
import { HeldKeyBadge, ShortcutKeys } from './primitives/key-chip';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { StatusIndicator } from './primitives/status-indicator';
import {
  AskPagerContext,
  askKeyAttributes,
  handleAskCardKeys,
  type AskKey,
  type AskPager,
} from './ask-card-keys';
import { jsonLine, useHighlightedLines, WRAP_MARKS } from './ask-code-lines';
import { TechnicalDetails } from './technical-details';

/**
 * The ask card: the one surface for every moment the agent waits on you
 * (permission, question, plan, verify). Icon and title, the facts at rest,
 * then options as numbered buttons. The left edge says what kind it is.
 */
export type AskKind = 'question' | 'permission' | 'plan' | 'verify';

// A question is amber in every theme: `question`, not `action`, which a brand may recolor.
const EDGE: Record<AskKind, string> = {
  question: 'border-l-question',
  permission: 'border-l-warning',
  plan: 'border-l-primary',
  verify: 'border-l-info',
};
const TONE: Record<AskKind, string> = {
  question: 'text-question',
  permission: 'text-warning',
  plan: 'text-primary',
  verify: 'text-info',
};

const KEY_TEXT: Record<string, string> = { Enter: 'Enter', Escape: 'Esc' };

/** A key chip inside a button or hint: `1`, `↵`, `Esc`, `D`. */
export function AskKeyChip({ askKey, className }: { askKey: AskKey; className?: string }) {
  const keys = [KEY_TEXT[askKey] ?? askKey.toUpperCase()];
  return (
    <span aria-hidden="true" className="inline-flex shrink-0">
      <ShortcutKeys className={className} keys={keys} variant="inline" />
      <HeldKeyBadge keys={keys} side="cover" />
    </span>
  );
}

/**
 * ‹ 1/2 › in the header: the queue's position, or a card's own pages (a question bundle).
 * [ ] step the queue; a card's own pages take them only when there is no queue.
 */
export function AskPagerControls({
  pager: own,
  label = 'Pending requests',
  noun = 'request',
}: { pager?: AskPager; label?: string; noun?: string } = {}) {
  const queue = useContext(AskPagerContext);
  const pager = own ?? queue;
  if (!pager || pager.total < 2) return null;
  const keyed = !own || !queue || queue.total < 2;
  return (
    <TooltipProvider>
      <nav
        aria-label={label}
        className="ml-auto flex shrink-0 items-center font-mono text-[11px] text-muted-foreground"
        data-slot="ask-pager"
      >
        <IconButton
          {...askKeyAttributes(keyed ? ['['] : [])}
          disabled={pager.index === 0}
          icon={<ChevronLeftIcon aria-hidden="true" />}
          label={`Previous ${noun}`}
          onClick={pager.onPrevious}
          size="sm"
        />
        <span aria-atomic="true" aria-live="polite" className="min-w-7 text-center tabular-nums">
          {pager.index + 1}/{pager.total}
        </span>
        <IconButton
          {...askKeyAttributes(keyed ? [']'] : [])}
          disabled={pager.index === pager.total - 1}
          icon={<ChevronRightIcon aria-hidden="true" />}
          label={`Next ${noun}`}
          onClick={pager.onNext}
          size="sm"
        />
      </nav>
    </TooltipProvider>
  );
}

export interface AskCardProps extends Omit<ComponentProps<'section'>, 'title'> {
  kind: AskKind;
  icon: LucideIcon;
  title: ReactNode;
  /** Full title on hover when it is cut. */
  titleText?: string;
  /** Let the title take two lines when the card is narrow (questions). */
  wrapTitle?: boolean;
  /** Muted, one line after the title: a tool id or a file. */
  meta?: ReactNode;
  metaMono?: boolean;
  /** Who is asking, when it is not the conversation on screen. */
  owner?: ReactNode;
  /** Header controls before the pager (Cancel). */
  headerActions?: ReactNode;
}

/** The frame: kind edge, header, and a 25px content indent shared by every part. */
export function AskCard({
  kind,
  icon: Icon,
  title,
  titleText,
  wrapTitle,
  meta,
  metaMono,
  owner,
  headerActions,
  children,
  className,
  onKeyDown,
  ...props
}: AskCardProps) {
  return (
    <section
      data-slot="ask-card"
      data-ask-kind={kind}
      tabIndex={-1}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        handleAskCardKeys(event);
      }}
      className={cn(
        // A surface may cap the card (--ask-card-max): AskBody and a long AskCode give up height
        // and the options stay. Open Technical details scroll inside it, so the cap holds.
        'group/ask @container/ask relative flex max-h-(--ask-card-max) min-w-0 flex-col rounded-[10px] border border-l-[3px] border-border bg-card pt-[9px] pr-2.5 pb-3 pl-3 text-[12.5px] text-foreground outline-none focus-visible:border-y-ring focus-visible:border-r-ring',
        EDGE[kind],
        className,
      )}
      {...props}
    >
      {/* When the dock scrolls an uncapped card, the title and pager stay. The
          header repeats the card's top edge (border, radius, kind edge) so it stays with them, and
          shows a hairline once content scrolls under it. The hairline is an inset shadow, not a
          bottom border, so the kind edge does not mitre into a notch where the header ends. */}
      <header
        className={cn(
          'sticky top-0 z-[1] -mt-[10px] -mr-[11px] -ml-[15px] flex min-h-[37px] min-w-0 shrink-0 items-center gap-[9px] rounded-t-[10px] border border-b-0 border-l-[3px] border-border bg-card pt-[9px] pr-2.5 pl-3 in-data-ask-scrolled:shadow-[inset_0_-1px_0_var(--color-border)] group-focus-visible/ask:border-t-ring group-focus-visible/ask:border-r-ring',
          EDGE[kind],
        )}
      >
        <Icon aria-hidden="true" className={cn('size-4 shrink-0', TONE[kind])} />
        <h2
          className={cn(
            'min-w-0 shrink truncate text-[13.5px] leading-5 font-medium',
            // A question reads whole: at a fifth of the window it takes a second line.
            wrapTitle && '@max-[420px]/ask:line-clamp-2 @max-[420px]/ask:whitespace-normal',
          )}
          data-slot="pending-interaction-title"
          title={titleText}
        >
          {title}
        </h2>
        {meta ? (
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-muted-foreground',
              metaMono ? 'font-mono text-[11.5px]' : 'text-[12px]',
            )}
            data-slot="ask-meta"
          >
            {meta}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <AskPagerControls />
        {headerActions}
      </header>
      {owner ? (
        <div className="mt-0.5 ml-[25px] min-w-0 @max-[420px]/ask:ml-0" data-slot="ask-owner">
          {owner}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Content aligned under the title; at a fifth of the window it uses the full width. */
export function AskSection({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('mt-2 ml-[25px] min-w-0 @max-[420px]/ask:ml-0', className)} {...props} />
  );
}

/**
 * What the reader weighs before answering (facts, a script). When the card is
 * capped this part scrolls, so the options and Technical details stay in view.
 */
export function AskBody({ className, ...props }: ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const clipped = element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      element.toggleAttribute('data-clipped', clipped);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);
  return (
    <div
      ref={ref}
      className={cn(
        // No reserved gutter (over .clio-scrollbar's): body blocks end on the header's edge.
        'clio-scrollbar min-h-0 flex-auto overflow-y-auto [scrollbar-gutter:auto]! data-clipped:[mask-image:linear-gradient(#000_calc(100%-24px),transparent)]',
        className,
      )}
      data-slot="ask-body"
      {...props}
    />
  );
}

/** A one-line subject under the title: the question in full, a summary. */
export function AskSubject({ className, ...props }: ComponentProps<'div'>) {
  return (
    <AskSection
      className={cn('mt-1 text-[12.5px] text-muted-foreground', className)}
      data-slot="ask-subject"
      {...props}
    />
  );
}

export interface AskFact {
  label: string;
  icon?: ReactNode;
  value: ReactNode;
  title?: string;
  mono?: boolean;
  /** The value may take a second line (a note under it). */
  wrap?: boolean;
  /** At a fifth of the window: a shorter value, or `false` to move the row behind ⓘ. */
  narrow?: ReactNode | false;
}

/** Facts at rest: one line each, fixed label column, ellipsis; labels become icons when narrow. */
export function AskFacts({ facts, className }: { facts: readonly AskFact[]; className?: string }) {
  if (!facts.length) return null;
  return (
    <AskSection className={cn('mt-2', className)}>
      <KeyValueGrid
        items={facts.map(
          (fact): KeyValueItem => ({
            label: fact.label,
            icon: fact.icon,
            value: fact.value,
            title: fact.title,
            mono: fact.mono,
            wrap: fact.wrap,
            narrow: fact.narrow,
          }),
        )}
        variant="facts"
      />
    </AskSection>
  );
}

/** The options row: full-size numbered buttons that wrap when there is no room; stacked when narrow. */
export function AskOptions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <AskSection
      className={cn(
        'mt-2.5 flex shrink-0 flex-wrap items-center gap-1.5 @max-[420px]/ask:flex-col @max-[420px]/ask:items-stretch',
        className,
      )}
      data-slot="ask-options"
      role="group"
      {...props}
    />
  );
}

export interface AskButtonProps extends Omit<ComponentProps<typeof Button>, 'size' | 'variant'> {
  /** The number key that picks it. */
  number?: number;
  /** `Enter` on the filled button, `Escape` on the one that backs out. */
  hint?: 'Enter' | 'Escape';
  primary?: boolean;
}

/** One 28px option button with its keys inside; it never shrinks or cuts its label. */
export function AskButton({
  number,
  hint,
  primary,
  children,
  className,
  ...props
}: AskButtonProps) {
  const keys = [...(number ? [String(number)] : []), ...(hint ? [hint] : [])];
  return (
    <Button
      {...askKeyAttributes(keys)}
      className={cn(
        'h-7 shrink-0 gap-[7px] rounded-[7px] px-2.5 text-[12.5px] font-medium whitespace-nowrap focus-visible:border-ring focus-visible:ring-0 focus-visible:[box-shadow:inset_0_0_0_1px_var(--ring)] @max-[420px]/ask:justify-start',
        !primary && 'border-input bg-transparent text-foreground',
        // A filled button waiting on a choice keeps the 1px edge of every other option.
        primary && 'disabled:border-input',
        className,
      )}
      data-slot="ask-button"
      size="sm"
      variant={primary ? 'default' : 'outline'}
      {...props}
    >
      {number ? <AskKeyChip askKey={String(number)} /> : null}
      {/* Stacked, the label fills: number key left, ↵/Esc at the right edge. */}
      <span className="min-w-0 truncate text-left @max-[420px]/ask:flex-1">{children}</span>
      {hint ? <AskKeyChip askKey={hint} /> : null}
    </Button>
  );
}

export interface AskRowProps extends Omit<ComponentProps<'button'>, 'children'> {
  number?: number;
  label: ReactNode;
  detail?: ReactNode;
  /** A checkbox or a mark before the label (multi-choice). */
  control?: ReactNode;
  /** The row ↵ would pick. */
  highlighted?: boolean;
}

/** Vertical option rows, for options that carry a line of detail. */
export function AskRows({ className, ...props }: ComponentProps<'div'>) {
  return (
    <AskSection
      className={cn('mt-2 ml-[19px] flex flex-col gap-0.5 @max-[420px]/ask:ml-0', className)}
      data-slot="ask-rows"
      {...props}
    />
  );
}

export function AskRow({
  number,
  label,
  detail,
  control,
  highlighted,
  className,
  ...props
}: AskRowProps) {
  const keys = [
    ...(number && number < 10 ? [String(number)] : []),
    ...(highlighted ? ['Enter'] : []),
  ];
  // A choosable row (radio, checkbox) keeps a 14px check column, as the spec's menus do.
  const checkable = props['aria-checked'] !== undefined;
  const checked = props['aria-checked'] === true || props['aria-checked'] === 'true';
  return (
    <button
      {...askKeyAttributes(keys)}
      className={cn(
        'flex min-h-[30px] w-full min-w-0 items-center gap-2.5 rounded-[7px] px-1.5 text-left text-[12.5px] text-foreground/85 outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:[box-shadow:inset_0_0_0_1.5px_var(--ring)] disabled:pointer-events-none disabled:opacity-50 aria-checked:text-foreground',
        // --hover sits at --card's level in the dark themes; a foreground tint reads in every theme.
        highlighted && 'bg-foreground/[0.07] text-foreground',
        className,
      )}
      data-highlighted={highlighted || undefined}
      data-slot="ask-row"
      type="button"
      {...props}
    >
      {control}
      {number && number < 10 ? <AskKeyChip askKey={String(number)} /> : null}
      <span className="min-w-0 shrink truncate">{label}</span>
      {detail ? (
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground/70">{detail}</span>
      ) : (
        <span className="flex-1" />
      )}
      {highlighted ? <AskKeyChip askKey="Enter" /> : null}
      {checkable ? (
        <span
          aria-hidden="true"
          className="grid w-3.5 shrink-0 place-items-center"
          data-slot="ask-row-check"
        >
          {checked ? <CheckIcon className="size-[13px] text-accent-foreground" /> : null}
        </span>
      ) : null}
    </button>
  );
}

/** Quiet hints under the options: "Or type your own answer below", "Esc Dismiss". */
export function AskFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <AskSection
      className={cn(
        'mt-2.5 flex min-w-0 items-center gap-4 overflow-hidden text-[11.5px] whitespace-nowrap text-muted-foreground',
        className,
      )}
      data-slot="ask-footer"
      {...props}
    />
  );
}

/** A footer hint that is also a control. */
export function AskHint({
  askKey,
  children,
  className,
  ...props
}: ComponentProps<'button'> & { askKey?: AskKey }) {
  return (
    <button
      {...askKeyAttributes(askKey ? [askKey] : [])}
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 rounded-[5px] outline-none hover:text-foreground focus-visible:[box-shadow:0_0_0_1.5px_var(--ring)] disabled:opacity-50',
        className,
      )}
      type="button"
      {...props}
    >
      {askKey ? <AskKeyChip askKey={askKey} /> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

/**
 * Technical details: a quiet line under the options; it or D expands them in place. Open, they
 * scroll inside the card, so the card still stops at its cap and the options stay in view.
 */
export function AskDetails({
  children,
  title = 'Technical details',
  hint,
}: {
  children: ReactNode;
  title?: string;
  /** What is inside, beside the open line ("raw arguments, as the agent sent them"). */
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Its own height when that is less than the floor, so short details never leave a gap.
  const [natural, setNatural] = useState<number>();
  // Under the cap the details scroll; their foot fades so the cut reads as "more below".
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const section = body?.closest<HTMLElement>('[data-slot="ask-details"]');
    if (!open || !body || !section) return;
    let scroller: HTMLElement = body;
    while (scroller.parentElement && scroller !== section) {
      scroller = scroller.parentElement;
      if (getComputedStyle(scroller).overflowY === 'auto') break;
    }
    const update = () => {
      const top = scroller.getBoundingClientRect().top - section.getBoundingClientRect().top;
      setNatural(Math.ceil(top + scroller.scrollHeight));
      setClipped(
        scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1 &&
          scroller.clientHeight > 0,
      );
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(body);
    observer?.observe(scroller);
    scroller.addEventListener('scroll', update, { passive: true });
    return () => {
      observer?.disconnect();
      scroller.removeEventListener('scroll', update);
    };
  }, [open]);
  return (
    <AskSection
      // Open, the raw arguments give up height first (down to a few lines that scroll), then
      // a script, so the facts and options stay whole under the cap.
      className={cn(
        'mt-2.5 flex min-h-0 flex-col text-[11.5px] text-muted-foreground',
        open ? 'shrink-[1000]' : 'shrink-0',
      )}
      data-slot="ask-details"
      data-details-clipped={open && clipped ? '' : undefined}
      style={open ? { minHeight: natural ? `min(8rem, ${natural}px)` : '8rem' } : undefined}
    >
      <TechnicalDetails
        className="flex min-h-0 flex-col"
        contentClassName="clio-scrollbar min-h-0 overflow-y-auto overscroll-contain in-data-details-clipped:[mask-image:linear-gradient(#000_calc(100%-24px),transparent)]"
        hint={open ? hint : undefined}
        // The spec's 16px between the line and its caption; the caption goes first when narrow.
        hintClassName="ml-2 @max-[420px]/ask:hidden"
        onOpenChange={setOpen}
        shortcut="D"
        summaryClassName="h-6 font-normal"
        title={title}
        triggerProps={askKeyAttributes(['d'])}
      >
        <div
          aria-label={title}
          className="grid min-w-0 gap-1.5 pt-1 [overflow-wrap:anywhere]"
          data-slot="ask-details-body"
          ref={bodyRef}
          role="region"
        >
          {children}
        </div>
      </TechnicalDetails>
    </AskSection>
  );
}

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
        label={copied ? 'Copied' : label}
        onClick={() => {
          void copyText(code).then(
            () => setCopied(true),
            () => toast.error('Could not copy to the clipboard.'),
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
  openLabel = 'Open in tab',
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
        <div className="flex h-[30px] min-w-0 shrink-0 items-center gap-2 border-b border-border pr-1 pl-2.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
          {NameIcon ? <NameIcon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
          <span className="truncate text-[12px] font-medium text-foreground/90">{name}</span>
          {meta ? <span className="truncate">{meta}</span> : null}
          <span className="flex-1" />
          {wrapToggle ? (
            <TooltipProvider>
              <IconButton
                className="text-muted-foreground"
                icon={<WrapTextIcon aria-hidden="true" />}
                label={wrap ? 'Stop wrapping long lines' : 'Wrap long lines'}
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
          'clio-scrollbar grid min-h-0 grid-cols-[34px_minmax(0,1fr)] py-1.5 pr-2.5 font-mono text-[11.5px] leading-[1.65] text-foreground/90',
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
        <div className="flex h-[30px] min-w-0 shrink-0 items-center gap-2.5 border-t border-border pr-1.5 pl-2.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
          <span className="truncate">{hidden > 0 ? `${hidden} more ${hidden === 1 ? 'line' : 'lines'}` : null}</span>
          <AskButton
            {...askKeyAttributes(['o'])}
            className="ml-auto h-6 px-2 text-[12px]"
            onClick={onOpen ?? (() => setExpanded(true))}
          >
            <span className="inline-flex items-center gap-1.5">
              {onOpen ? <PanelRightIcon aria-hidden="true" className="size-3.5" /> : null}
              {onOpen ? openLabel : 'Show all'}
              <AskKeyChip askKey="o" />
            </span>
          </AskButton>
        </div>
      ) : null}
    </AskSection>
  );
}

/** One quiet line when this card's own answer failed; assertive, never color alone. */
export function AskError({ error, className }: { error?: Error; className?: string }) {
  if (!error) return null;
  return (
    <AskSection
      className={cn(
        'mt-2 flex min-w-0 items-center gap-1.5 text-[12px] text-destructive',
        className,
      )}
      data-slot="ask-error"
      role="alert"
    >
      <span className="shrink-0 font-medium">Response unavailable</span>
      <span className="min-w-0 truncate text-destructive/85" title={error.message}>
        {error.message}
      </span>
    </AskSection>
  );
}

const ANSWERED_STATUS = {
  ok: { tone: 'success', label: 'Done' },
  denied: { tone: 'stopped', label: 'Denied' },
  neutral: { tone: 'inactive', label: 'Closed' },
} as const;

/**
 * Once answered, the card folds into one activity row: chevron, icon, verb,
 * detail and outcome, then the transcript's fixed columns (hover copy and open,
 * status, ⓘ), so it lines up with the tool rows around it.
 */
export function AskAnsweredRow({
  icon: Icon,
  verb,
  detail,
  mono,
  outcome,
  tone = 'ok',
  title,
  open,
  onOpenChange,
  actions,
  info,
  ...props
}: Omit<ComponentProps<'div'>, 'children' | 'title'> & {
  icon: LucideIcon;
  verb: string;
  detail?: ReactNode;
  mono?: boolean;
  /** Who decided, beside the detail ("you denied it"); warning-toned when denied. */
  outcome?: string;
  tone?: 'ok' | 'denied' | 'neutral';
  /** The full detail on hover when it is cut. */
  title?: string;
  /** With `onOpenChange`, the chevron opens what was decided under the row. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hover actions: copy, and open in the right pocket (`data-activity-action`). */
  actions?: ReactNode;
  /** The ⓘ (ActivityInfoButton); the column stays when absent. */
  info?: ReactNode;
}) {
  const status = ANSWERED_STATUS[tone];
  return (
    <ActivityRow
      data-answered={tone}
      disclosure={
        onOpenChange ? (
          <ActivityDisclosure
            label={`${open ? 'Collapse' : 'Expand'} ${verb}`}
            onClick={() => onOpenChange(!open)}
            open={Boolean(open)}
          />
        ) : null
      }
      icon={<Icon aria-hidden="true" />}
      name={verb}
      argument={detail}
      argumentStyle={mono ? 'code' : 'text'}
      argumentTitle={title}
      outcome={outcome}
      outcomeTone={tone === 'denied' ? 'warning' : 'muted'}
      actions={actions}
      status={
        <StatusIndicator
          display="column"
          icon={
            tone === 'neutral' ? (
              <MinusIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
            ) : tone === 'denied' ? (
              <OctagonMinusIcon aria-hidden="true" className="size-3.5 text-warning" />
            ) : undefined
          }
          label={status.label}
          mark="glyph"
          tone={status.tone}
        />
      }
      info={info}
      open={open}
      onOpenChange={onOpenChange}
      {...props}
    />
  );
}
