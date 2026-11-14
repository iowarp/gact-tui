import { useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { AddIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { IconButton } from './primitives/icon-button';
import { NARROW_HIDDEN, SETTINGS_COLUMN } from '@/lib/settings-fold';
import { SettingsResultsContext } from '@/lib/settings-search-results';
import { InfoTip } from './info-tip';
import { SearchHighlight } from './search-highlight';
import { t } from '@lingui/core/macro';

/**
 * Setting row (B): label and ⓘ hint on the left, the control on the right, one
 * 44 px line. Explanation lives behind the ⓘ; `note` is a short visible state
 * under the label ("Following your system, now dark"). Rows take 60% of a
 * wide page (`fullWidth` keeps the whole width, for a wide control such as a
 * path field) and stack their control under the label when narrow.
 */
export function SettingsRow({
  title,
  description,
  info,
  note,
  error,
  children,
  htmlFor,
  inlineControl = false,
  wideControl = false,
  fullWidth = false,
  dirty = false,
}: {
  title: string;
  /** Explanation of the setting; shown behind the ⓘ beside the label. */
  description?: ReactNode;
  /** More explanation behind the same ⓘ (source, effect, …). */
  info?: ReactNode;
  /** Visible state under the label; short, but wraps when a translation runs long. */
  note?: ReactNode;
  /** A validation message under the label. */
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  /**
   * Small controls such as switches stay beside their label, and drop under it
   * only when the label would otherwise narrow below its longest word (or 4em).
   */
  inlineControl?: boolean;
  /**
   * A control wider than the value column (a segmented choice with many
   * options) sits beside the label while both fit and drops under it when
   * they don't, so it never covers the label.
   */
  wideControl?: boolean;
  /** Use the page's whole width instead of 60% of a wide page. */
  fullWidth?: boolean;
  /** A typed value waiting in the save bar. */
  dirty?: boolean;
}) {
  const hint =
    description && info ? (
      <div className="grid gap-1.5">
        <div>{description}</div>
        <div>{info}</div>
      </div>
    ) : (
      (description ?? info)
    );
  // In the filtered window only the matching rows show, their match marked.
  const results = useContext(SettingsResultsContext);
  const match = results?.labels.has(title) ? results.query : undefined;
  const name = match ? <SearchHighlight query={match} text={title} /> : title;
  return (
    <div
      className={cn('@container w-full', !fullWidth && SETTINGS_COLUMN)}
      data-setting-match={match !== undefined || undefined}
      data-slot="settings-row-frame"
    >
      <div
        data-slot="settings-row"
        data-setting={title}
        data-dirty={dirty || undefined}
        data-control={inlineControl && !wideControl ? 'inline' : undefined}
        className={cn(
          'relative min-h-11 items-center gap-x-4 gap-y-2 border-b border-border/70 py-[0.3125rem]',
          wideControl || inlineControl
            ? // A wrapped control is alone on its line, so space-between starts it under the label.
              'flex flex-wrap justify-between'
            : 'grid',
          wideControl || inlineControl
            ? null
            : // Two columns from a 20rem row, as the spec's 322 px dialog rows are. In the
                // Settings window the rows stack before the nav folds to a rail (< 1024 px).
                'grid-cols-1 @xs:grid-cols-[minmax(min-content,1fr)_minmax(52%,max-content)] max-[1023px]:in-data-window-content:grid-cols-1!',
          dirty &&
            'before:absolute before:top-[1.1875rem] before:-left-3.5 before:size-1.5 before:rounded-full before:bg-primary',
        )}
      >
        <div
          className={cn(
            // Beside its control the label column is at least 6rem and its longest
            // word, so a long Greek word wraps whole instead of mid-word.
            wideControl ? 'min-w-0' : inlineControl ? null : 'min-w-24',
            // In the folded window every row stacks, so this one does too.
            wideControl && 'flex-auto max-[1023px]:in-data-window-content:basis-full',
            // A small control stays beside its label while the label keeps its longest
            // word (and 4em, for CJK phrases); past that the control drops under it
            // instead of squeezing the label to one character per line.
            inlineControl && !wideControl && 'flex-[1_1_0%]',
          )}
        >
          {/* A long name (Greek, Japanese) wraps whole rather than ending in an ellipsis. */}
          <div
            className={cn(
              'flex items-center gap-1.5',
              inlineControl && !wideControl ? 'min-w-[4em]' : 'min-w-0',
            )}
          >
            {htmlFor ? (
              <Label
                htmlFor={htmlFor}
                className="block min-w-0 text-ui leading-snug font-normal text-pretty break-words [word-break:auto-phrase]"
                data-slot="settings-label"
                title={title}
              >
                {name}
              </Label>
            ) : (
              <h2
                className="min-w-0 text-ui leading-snug font-normal text-pretty break-words [word-break:auto-phrase]"
                data-slot="settings-label"
                title={title}
              >
                {name}
              </h2>
            )}
            {hint ? (
              <InfoTip className={cn('text-faint', NARROW_HIDDEN)} label={t`About ${title}`}>
                {hint}
              </InfoTip>
            ) : null}
          </div>
          {note ? (
            <div
              // Wraps rather than cuts: a translated note runs longer than its English.
              className={cn(
                'mt-0.5 text-label text-pretty text-muted-foreground [overflow-wrap:anywhere]',
                NARROW_HIDDEN,
              )}
              data-slot="settings-note"
            >
              {note}
            </div>
          ) : null}
          {error ? (
            <div className="mt-0.5 text-xs text-destructive" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <div
          data-slot="settings-control"
          className={cn(
            'flex w-full min-w-0 items-center justify-start gap-2 whitespace-nowrap @xs:justify-end max-[1023px]:in-data-window-content:justify-start!',
            // The settings field (.xf): 30 px, 12.5 px text; numbers 12 px mono, right-aligned.
            // Number fields keep their own padding, so an in-field unit never covers the digits.
            '[&_input:not([aria-hidden])]:h-[1.875rem] [&_input:not([aria-hidden])]:rounded-[0.375rem] [&_input:not([aria-hidden]):not([type=number])]:px-[0.5625rem] [&_input:not([aria-hidden])]:text-menu dark:[&_input:not([aria-hidden])]:bg-sidebar',
            '[&_input[type=number]]:text-right [&_input[type=number]]:font-mono [&_input[type=number]]:text-meta',
            (wideControl || inlineControl) && 'w-auto max-w-full',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Small muted label over a run of rows ("Response", "Model servers"), with an optional + at the right. */
export function SettingsGroupLabel({
  children,
  info,
  onAdd,
  addLabel,
  actions,
  className,
}: {
  children: ReactNode;
  /** Explanation behind an ⓘ right after the label. */
  info?: ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  /** Other icon actions at the right end. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Wraps when the actions don't fit beside the label: they drop under it,
        // so the label stays whole and nothing runs past the row.
        'mt-4 flex min-h-7 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-label whitespace-nowrap text-muted-foreground',
        className,
      )}
      data-slot="settings-group-label"
    >
      {/* A long localized label wraps rather than clipping. */}
      <h2 className="max-w-full min-w-0 shrink-0 font-normal break-words whitespace-normal [word-break:auto-phrase]">
        {children}
      </h2>
      {info ? (
        <InfoTip
          className={cn('text-faint', NARROW_HIDDEN)}
          label={typeof children === 'string' ? t`About ${children}` : t`About this group`}
        >
          {info}
        </InfoTip>
      ) : null}
      {actions || onAdd ? (
        // ml-auto keeps the actions at the right end, also when they wrap under the label.
        <span className="ml-auto flex max-w-full min-w-0 items-center justify-end gap-2">
          {actions}
          {onAdd ? (
            <IconButton icon={<AddIcon />} label={addLabel ?? t`Add`} onClick={onAdd} size="sm" />
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/** Accessible radio choices as one segmented control, with explanatory hover text. */
export function SettingsChoice({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Shown but not choosable (a setting this agent doesn't offer). */
  disabled?: boolean;
  options: Array<{
    value: string;
    label: string;
    description?: string;
    icon?: ComponentType<SVGProps<SVGSVGElement>>;
  }>;
}) {
  const hasIcons = options.some((option) => option.icon);
  const [choiceRef, iconOnly] = useIconOnlyFit(
    hasIcons,
    options.map((option) => option.label).join('\n'),
  );
  useBalancedWrap(choiceRef, hasIcons && iconOnly, value);
  return (
    <RadioGroup
      ref={choiceRef}
      aria-label={label}
      orientation="horizontal"
      value={value}
      onValueChange={onChange}
      data-slot="settings-choice"
      data-compact={iconOnly || undefined}
      disabled={disabled}
      className={cn(
        'inline-flex w-auto max-w-full min-w-0 gap-px rounded-[0.4375rem] bg-muted p-0.5',
        // Icon choices fold to icons; word-only choices that don't fit (a long translation
        // in a narrow column) wrap onto a second line instead of overflowing it. Folded
        // icons wrap too when even they and the selected name don't fit.
        hasIcons && !iconOnly ? 'shrink-0' : 'flex-wrap',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      {options.map(({ value: option, label: name, description, icon: Icon }) => (
        <Label
          key={option}
          htmlFor={`${id}-${option}`}
          // Icon choices drop to icon-only when their names don't fit; the title keeps the name.
          title={Icon ? (description ? `${name}: ${description}` : name) : description}
          className={cn(
            'flex h-6 min-w-0 cursor-pointer items-center gap-1.5 rounded-[0.3125rem] px-2.5 text-xs font-normal whitespace-nowrap text-muted-foreground hover:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring',
            value === option && 'bg-menu-highlight text-foreground',
          )}
        >
          <RadioGroupItem
            className="sr-only absolute size-px border-0"
            id={`${id}-${option}`}
            value={option}
            onFocus={() => {
              // Radix can defer arrow-key focus until after keyup. These Settings
              // radios select the focused choice, including a quick key press.
              if (value !== option) onChange(option);
            }}
          />
          {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
          {/* Folded to icons, the selected choice still names itself, in full. */}
          <span
            className={cn(
              Icon && iconOnly ? (value === option ? 'shrink-0' : 'sr-only') : 'min-w-0 truncate',
            )}
          >
            {name}
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}

/**
 * Whether icon choices must drop their names: true when the names would not fit
 * the space the control is given. A fixed breakpoint can't know this, because the
 * row's control column narrows at several widths (the 60% row, the window rail).
 */
function useIconOnlyFit(
  hasIcons: boolean,
  names: string,
): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useLayoutEffect(() => {
    const group = ref.current;
    const slot = group?.parentElement;
    if (!hasIcons || !group || !slot || typeof ResizeObserver === 'undefined') return;
    const check = () => {
      // The group's one-line width with every name at full length, whether a name
      // is showing (and maybe truncated) or folded to sr-only. Summed per choice,
      // so a folded group that wraps still measures as one line.
      const style = getComputedStyle(group);
      const choices = group.querySelectorAll<HTMLElement>(':scope > label');
      let need =
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        Math.max(0, choices.length - 1) * (parseFloat(style.columnGap) || 0);
      for (const choice of choices) {
        need += choice.offsetWidth;
        const name = choice.querySelector<HTMLElement>(':scope > span');
        if (!name) continue;
        const shown = name.getBoundingClientRect().width;
        const gap = parseFloat(getComputedStyle(choice).columnGap) || 0;
        need += shown > 1 ? name.scrollWidth - shown : name.scrollWidth + gap;
      }
      // The control column sizes to its content, so it narrows once the names fold.
      // A label beside it can give up everything above its 6rem minimum.
      const label = slot.previousElementSibling;
      const beside =
        label instanceof HTMLElement && label.offsetTop + label.offsetHeight > slot.offsetTop
          ? Math.max(
              0,
              label.clientWidth -
                6 * parseFloat(getComputedStyle(document.documentElement).fontSize),
            )
          : 0;
      setOn(slot.clientWidth + beside + 0.5 < need);
    };
    const observer = new ResizeObserver(check);
    observer.observe(slot.parentElement ?? slot);
    return () => observer.disconnect();
  }, [hasIcons, names]);
  return [ref, on];
}

/**
 * When folded icons and the selected name still need two lines, narrows the group
 * to the least width that keeps that many lines, so the icons split evenly (3 + 2)
 * instead of leaving one alone on the last line.
 */
function useBalancedWrap(ref: RefObject<HTMLDivElement | null>, folded: boolean, value: string) {
  useLayoutEffect(() => {
    const group = ref.current;
    const observed = group?.parentElement?.parentElement;
    if (!group || !observed) return;
    group.style.maxWidth = '';
    if (!folded || typeof ResizeObserver === 'undefined') return;
    const balance = () => {
      group.style.maxWidth = '';
      const style = getComputedStyle(group);
      const frame = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const gap = parseFloat(style.columnGap) || 0;
      const choices = [...group.querySelectorAll<HTMLElement>(':scope > label')];
      const widths = choices.map((choice) => choice.getBoundingClientRect().width);
      const lines = (width: number) => {
        let count = 1;
        let used = 0;
        for (const item of widths) {
          if (used && used + gap + item > width - frame) {
            count += 1;
            used = item;
          } else used += (used ? gap : 0) + item;
        }
        return count;
      };
      const available = group.clientWidth;
      const need = new Set(choices.map((choice) => choice.offsetTop)).size;
      if (need < 2) return;
      let low = Math.max(...widths) + frame;
      let high = available;
      while (high - low > 0.5) {
        const mid = (low + high) / 2;
        if (lines(mid) > need) low = mid;
        else high = mid;
      }
      group.style.maxWidth = `${Math.ceil(high) + 1}px`;
    };
    balance();
    const observer = new ResizeObserver(balance);
    observer.observe(observed);
    return () => {
      observer.disconnect();
      group.style.maxWidth = '';
    };
  }, [ref, folded, value]);
}
