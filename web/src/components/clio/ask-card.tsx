import {
  Fragment,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { ChevronLeftIcon, ChevronRightIcon, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { IconButton } from './primitives/icon-button';
import { HeldKeyBadge, ShortcutKeys } from './primitives/key-chip';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import {
  AskPagerContext,
  askKeyAttributes,
  handleAskCardKeys,
  type AskKey,
  type AskPager,
} from './ask-card-keys';
import { TechnicalDetails } from './technical-details';
import { useOverflowMark, useScrollClipped } from './use-scroll-clipped';
import { composerFailureReason } from './composer-failure';
import { t } from '@lingui/core/macro';

/**
 * The ask card: the one surface for every moment the agent waits on you
 * (permission, question, plan, verify). Icon and title, the facts at rest,
 * then options as numbered buttons. The left edge says what kind it is.
 */
export type AskKind = 'question' | 'permission' | 'plan' | 'verify';

// A question is amber in every theme: `question`, not `action`, which a brand may recolor.
/** Narrow card with a pager: icon · pager · ✕ on the first line, the question whole beneath. */
const WRAP_PAGED_HEADER =
  '@max-[420px]/ask:has-[[data-slot=ask-pager]]:flex-wrap @max-[420px]/ask:has-[[data-slot=ask-pager]]:gap-y-0';
const WRAP_PAGED_ICON =
  '@max-[420px]/ask:group-has-[[data-slot=ask-pager]]/ask-head:mt-0 @max-[420px]/ask:group-has-[[data-slot=ask-pager]]/ask-head:self-center';
const WRAP_PAGED_TITLE =
  '@max-[420px]/ask:group-has-[[data-slot=ask-pager]]/ask-head:order-last @max-[420px]/ask:group-has-[[data-slot=ask-pager]]/ask-head:basis-full @max-[420px]/ask:group-has-[[data-slot=ask-pager]]/ask-head:pt-0';

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

// i18n-ignore: keyboard key names, printed on the keys
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
  label = t`Pending requests`,
  noun = 'request',
}: { pager?: AskPager; label?: string; noun?: 'request' | 'question' } = {}) {
  const queue = useContext(AskPagerContext);
  const pager = own ?? queue;
  if (!pager || pager.total < 2) return null;
  const keyed = !own || !queue || queue.total < 2;
  return (
    <TooltipProvider>
      <nav
        aria-label={label}
        className="ml-auto flex shrink-0 items-center font-mono text-caption text-muted-foreground"
        data-slot="ask-pager"
      >
        <IconButton
          {...askKeyAttributes(keyed ? ['['] : [])}
          disabled={pager.index === 0}
          icon={<ChevronLeftIcon aria-hidden="true" />}
          label={noun === 'question' ? t`Previous question` : t`Previous request`}
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
          label={noun === 'question' ? t`Next question` : t`Next request`}
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
  /** Drawn in the icon's place: a connector's logo. */
  leading?: ReactNode;
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
  /** Read after the title by a screen reader only: the tool and what it was given. */
  spokenDetail?: string;
}

/**
 * A wrapped title may name a tool (clio_jarvis.xcompact3d): it may break after a `.`, `_` or `/`
 * between letters, so a narrow card wraps it at a word part before cutting inside one.
 */
function identifierBreaks(text: string): ReactNode {
  const parts = text.split(/(?<=[\p{L}\d][._/])(?=\p{L})/u);
  if (parts.length < 2) return text;
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

/**
 * The height a capped card needs with every part that gives up height at its floor (a scrolling
 * body or option list at none, a script at its few lines). The dock lets a card past its 45% cap
 * up to that, so the parts that keep their height (a permission's options) stay in view.
 */
function publishAskCardNeed(card: HTMLElement) {
  let slack = 0;
  for (const child of card.children) {
    if (!(child instanceof HTMLElement)) continue;
    const style = getComputedStyle(child);
    if (style.position === 'absolute' || style.position === 'fixed' || style.flexShrink === '0')
      continue;
    const floor = Number.parseFloat(style.minHeight);
    if (Number.isFinite(floor)) slack += Math.max(0, child.offsetHeight - floor);
  }
  const need = card.offsetHeight + card.scrollHeight - card.clientHeight - slack;
  card.style.setProperty('--ask-card-need', `${Math.ceil(need)}px`);
}

/** A body's content height, so its floor never exceeds what it holds. */
function publishAskBodyContent(body: HTMLElement) {
  const content = `${body.scrollHeight}px`;
  if (body.style.getPropertyValue('--ask-body-content') !== content)
    body.style.setProperty('--ask-body-content', content);
}

/** The frame: kind edge, header, and a 25px content indent shared by every part. */
export function AskCard({
  kind,
  icon: Icon,
  leading,
  title,
  titleText,
  wrapTitle,
  meta,
  metaMono,
  owner,
  headerActions,
  spokenDetail,
  children,
  className,
  onKeyDown,
  onScroll,
  ...props
}: AskCardProps) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  useOverflowMark(ref, publishAskCardNeed);
  useScrollClipped(ref);
  const labelledBy = [
    `${id}-title`,
    meta ? `${id}-meta` : undefined,
    spokenDetail ? `${id}-detail` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section
      ref={ref}
      aria-labelledby={props['aria-label'] ? undefined : labelledBy}
      data-slot="ask-card"
      data-ask-kind={kind}
      role="group"
      tabIndex={-1}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        handleAskCardKeys(event);
      }}
      onScroll={(event) => {
        // Content under the sticky header draws its hairline (see the dock's viewport).
        if (event.target === event.currentTarget)
          event.currentTarget.toggleAttribute(
            'data-ask-scrolled',
            event.currentTarget.scrollTop > 0,
          );
        onScroll?.(event);
      }}
      className={cn(
        // A surface may cap the card (--ask-card-max): AskBody and a long AskCode give up height
        // and the options stay. When those parts at their floors still pass the cap, the card
        // grows to that need, up to the surface's --ask-card-ceiling. Open Technical details scroll inside it, so the cap holds. When
        // the parts that keep their height still pass the cap (stacked options at a large
        // interface size), the capped card scrolls as a whole instead of painting past its frame.
        // Only then is it a scroller. A card that fits is no scroller, so the wheel passes to the
        // dock and its sticky header stays at the top of the dock. At a scrolling card's end the
        // wheel also passes on; the dock contains it, so the transcript never moves. While more
        // of a scrolling card lies below, its bottom edge fades as AskBody's does, so a cut row
        // reads as continuing.
        'group/ask @container/ask relative flex max-h-[max(var(--ask-card-max),min(var(--ask-card-need,0px),var(--ask-card-ceiling,0px)))] min-w-0 flex-col rounded-[10px] border border-l-[3px] border-border bg-card pt-[9px] pr-2.5 pb-3 pl-3 text-menu text-foreground outline-none focus-visible:border-y-ring focus-visible:border-r-ring clio-scrollbar [scrollbar-gutter:auto]! in-data-ask-capped:data-overflows:overflow-x-hidden in-data-ask-capped:data-overflows:overflow-y-auto in-data-ask-capped:data-overflows:data-clipped:[mask-image:linear-gradient(#000_calc(100%-24px),transparent)]',
        EDGE[kind],
        className,
      )}
      {...props}
    >
      {/* When the dock scrolls a card that is not its own scroller, the title and pager stay. The
          header repeats the card's top edge (border, radius, kind edge) so it stays with them, and
          shows a hairline once content scrolls under it. The hairline is an inset shadow, not a
          bottom border, so the kind edge does not mitre into a notch where the header ends. */}
      <header
        className={cn(
          // A scrolling card pins its sticky header inside its padding; -10px keeps it at rest.
          'group/ask-head sticky top-0 z-[1] -mt-[10px] in-data-ask-capped:group-data-overflows/ask:-top-[10px] -mr-[calc(var(--spacing)*2.5+1px)] -ml-[calc(var(--spacing)*3+3px)] flex min-h-[37px] min-w-0 shrink-0 items-center gap-[9px] rounded-t-[10px] border border-b-0 border-l-[3px] border-border bg-card pt-[9px] pr-2.5 pl-3 in-data-ask-scrolled:shadow-[inset_0_-1px_0_var(--color-border)] in-data-ask-body-scrolled:shadow-[inset_0_-1px_0_var(--color-border)] group-focus-visible/ask:border-t-ring group-focus-visible/ask:border-r-ring',
          // Narrow, a paged question has no room beside its pager and ✕: it takes its own line.
          wrapTitle && WRAP_PAGED_HEADER,
          EDGE[kind],
        )}
      >
        {leading ?? (
          <Icon
            aria-hidden="true"
            // A wrapped question keeps its icon on the first line.
            className={cn(
              'size-4 shrink-0',
              wrapTitle && 'mt-1.5 self-start',
              wrapTitle && WRAP_PAGED_ICON,
              TONE[kind],
            )}
          />
        )}
        <h2
          className={cn(
            'min-w-0 text-[0.84375rem] leading-5 font-medium',
            // A question is what the person answers: it reads whole and wraps, never cut. It
            // takes the room the pager and ✕ leave; a tool id breaks between its parts (<wbr>).
            wrapTitle
              ? cn('flex-1 py-1 whitespace-normal break-words', WRAP_PAGED_TITLE)
              : 'shrink truncate',
          )}
          data-slot="pending-interaction-title"
          id={`${id}-title`}
          title={titleText}
        >
          {wrapTitle && typeof title === 'string' ? identifierBreaks(title) : title}
        </h2>
        {spokenDetail ? (
          <span className="sr-only" id={`${id}-detail`}>
            {spokenDetail}
          </span>
        ) : null}
        {meta ? (
          <span
            id={`${id}-meta`}
            className={cn(
              'min-w-0 flex-1 truncate text-muted-foreground',
              metaMono ? 'font-mono text-label' : 'text-meta',
            )}
            data-slot="ask-meta"
          >
            {meta}
          </span>
        ) : wrapTitle ? null : (
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
export function AskBody({ className, onScroll, ...props }: ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollClipped(ref);
  useOverflowMark(ref, publishAskBodyContent);
  return (
    <div
      ref={ref}
      className={cn(
        // No reserved gutter (over .clio-scrollbar's): body blocks end on the header's edge.
        // Content past either edge fades there; scrolled, the header draws its hairline.
        // In a capped card the body keeps about two fact rows (or all of a shorter body), so a
        // card scrolling itself still shows what the person answers; the card's need counts it.
        'clio-scrollbar min-h-0 flex-auto overflow-y-auto [scrollbar-gutter:auto]! in-data-ask-capped:min-h-[min(var(--ask-body-content,0px),3.5rem)] data-clipped:[mask-image:linear-gradient(#000_calc(100%-24px),transparent)] data-scrolled:[mask-image:linear-gradient(transparent,#000_16px)] data-clipped:data-scrolled:[mask-image:linear-gradient(transparent,#000_16px,#000_calc(100%-24px),transparent)]',
        className,
      )}
      data-slot="ask-body"
      onScroll={(event) => {
        const scrolled = event.currentTarget.scrollTop > 0;
        event.currentTarget.toggleAttribute('data-scrolled', scrolled);
        event.currentTarget
          .closest('[data-slot="ask-card"]')
          ?.toggleAttribute('data-ask-body-scrolled', scrolled);
        onScroll?.(event);
      }}
      {...props}
    />
  );
}

/** A one-line subject under the title: the question in full, a summary. */
export function AskSubject({ className, ...props }: ComponentProps<'div'>) {
  return (
    <AskSection
      className={cn('mt-1 text-menu text-muted-foreground', className)}
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
        // Stacked, one unwrapped column holds every button to the card's width (a wrapping
        // column sizes each line to its widest label instead).
        'mt-2.5 flex shrink-0 flex-wrap items-center gap-1.5 @max-[420px]/ask:flex-col @max-[420px]/ask:flex-nowrap @max-[420px]/ask:items-stretch',
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

/** One 28px option button with its keys inside; it never shrinks or cuts its label (stacked, a long one wraps). */
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
        'h-7 shrink-0 gap-[7px] rounded-[7px] px-2.5 text-menu font-medium whitespace-nowrap focus-visible:border-ring focus-visible:ring-0 focus-visible:[box-shadow:inset_0_0_0_1px_var(--ring)] @max-[420px]/ask:h-auto @max-[420px]/ask:min-h-7 @max-[420px]/ask:justify-start @max-[420px]/ask:py-1',
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
      <span className="min-w-0 truncate text-left @max-[420px]/ask:flex-1 @max-[420px]/ask:whitespace-normal">
        {children}
      </span>
      {hint ? <AskKeyChip askKey={hint} /> : null}
    </Button>
  );
}

/** Quiet hints under the options: "Or type your own answer below", "Esc Dismiss". */
export function AskFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <AskSection
      className={cn(
        // Hints that don't fit side by side take their own lines; a hint wider than the card wraps.
        'mt-2.5 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-label whitespace-nowrap text-muted-foreground',
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
      <span className="min-w-0 text-start whitespace-normal">{children}</span>
    </button>
  );
}

/**
 * Technical details: a quiet line under the options; it or D expands them in place. Open, they
 * scroll inside the card, so the card still stops at its cap and the options stay in view.
 */
export function AskDetails({
  children,
  title = t`Technical details`,
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
        'mt-2.5 flex min-h-0 flex-col text-label text-muted-foreground',
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

/** One quiet line when this card's own answer failed; assertive, never color alone. */
export function AskError({ error, className }: { error?: Error; className?: string }) {
  if (!error) return null;
  const reason = composerFailureReason(error, t`The service did not record your answer.`);
  return (
    <AskSection
      className={cn('mt-2 flex min-w-0 items-center gap-1.5 text-meta text-destructive', className)}
      data-slot="ask-error"
      role="alert"
    >
      <span className="shrink-0 font-medium">{t`Response unavailable`}</span>
      <span className="min-w-0 truncate text-destructive/85" title={reason}>
        {reason}
      </span>
    </AskSection>
  );
}

/** The folded, answered form lives beside the card; importers keep one entry point. */
export { AskAnsweredRow } from './ask-answered-row';
