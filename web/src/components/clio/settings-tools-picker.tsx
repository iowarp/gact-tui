import { CheckIcon, ChevronRightIcon, SearchIcon } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HelpIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { SettingsSelectField } from './model-select-field';
import { modeLabel } from './plugin-tool-settings-text';
import { KeyCap } from './primitives/key-chip';
import { MenuKeyHints } from './primitives/menu-key-hints';
import { SESSION_APPROVAL_OPTIONS } from './session-behavior-options';
import { identifierInputProps } from '@/lib/identifier-input';
import { t } from '@lingui/core/macro';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const MENU_HINTS = [
  { id: 'menu-move', label: t({ message: 'move', context: 'menu key hint' }) },
  { id: 'menu-pick', label: t({ message: 'choose', context: 'menu key hint' }) },
  { id: 'menu-close', label: t({ message: 'close', context: 'menu key hint' }) },
] as const;
const DEFAULT_TAG =
  'rounded-[3px] bg-faint/70 px-[2px] py-px text-[0.53125rem] leading-none font-bold text-foreground';

/**
 * An icon with a small D when its value is a default. The D sits on the
 * icon's lower corner, which Settings › Tools' round glyphs leave empty.
 * `beside` drops it just past the glyph instead, for glyphs that fill that
 * corner (a lock, a bell), and keeps its room when there is no D so the
 * labels of a column line up.
 */
export function ValueMark({
  icon: Glyph,
  isDefault,
  beside = false,
  className,
}: {
  icon: Icon;
  isDefault: boolean;
  beside?: boolean;
  className?: string;
}) {
  // In rem like its glyph: a px box lets a larger interface size push the glyph low and into the label.
  const glyph = (
    <span className="inline-grid size-[0.9375rem] shrink-0 place-items-center">
      <Glyph className={cn('size-3.5', className)} />
    </span>
  );
  if (beside)
    return (
      <span aria-hidden="true" className="inline-flex shrink-0 items-end gap-px">
        {glyph}
        <b className={cn(DEFAULT_TAG, 'translate-y-[0.3125rem]', !isDefault && 'invisible')}>D</b>
      </span>
    );
  return (
    <span aria-hidden="true" className="relative inline-grid shrink-0 place-items-center">
      {glyph}
      {isDefault ? (
        <b className={cn(DEFAULT_TAG, 'absolute -right-1.5 -bottom-[0.3125rem]')}>D</b>
      ) : null}
    </span>
  );
}

export interface PickerOption<Value extends string> {
  value: Value;
  label: string;
  description: string;
  icon: Icon;
  isDefault?: boolean;
}

/**
 * Opens a picker's list at the top when its chosen option fits there, and
 * otherwise at the first option or heading that still shows the chosen
 * option whole. The list's own scroll-into-view stops mid-option and leaves
 * the first visible one half under the search field.
 */
function useListOpensWhole(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const list = ref.current?.querySelector<HTMLElement>('[cmdk-list]');
        if (!list) return;
        const box = list.getBoundingClientRect();
        // The opening zoom scales the rects; offsetHeight is unscaled.
        const scale = list.offsetHeight ? box.height / list.offsetHeight : 1;
        const top = (el: Element) =>
          (el.getBoundingClientRect().top - box.top) / scale + list.scrollTop;
        const checked = list.querySelector<HTMLElement>('[data-checked="true"]');
        const bottom = checked ? top(checked) + checked.offsetHeight : 0;
        if (bottom <= list.clientHeight) {
          list.scrollTop = 0;
          return;
        }
        const padding = Number.parseFloat(getComputedStyle(list).paddingTop) || 0;
        const stops = [...list.querySelectorAll('[cmdk-item], [cmdk-group-heading]')]
          .map((el) => top(el) - padding)
          .sort((a, b) => a - b);
        const stop =
          stops.find((stop) => stop >= bottom - list.clientHeight) ?? bottom - list.clientHeight;
        const reach = list.scrollHeight - list.clientHeight;
        // Room below the last option so a stop near the end is reachable.
        if (stop > reach) list.style.paddingBottom = `${padding + stop - reach}px`;
        list.scrollTop = stop;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);
  return ref;
}

/** A select-shaped field that opens a searchable list of explained choices. */
export function ChoicePicker<Value extends string>({
  name,
  search,
  options,
  selected,
  onChoose,
  icon,
  label,
  title,
  isDefault = false,
  markBeside = false,
  chosen = false,
  bulk = false,
  disabled = false,
  className,
  iconClassName,
}: {
  /** The field's accessible name ("Permission: get_states"). */
  name: string;
  /** The search placeholder ("Permission for get_states"). */
  search: string;
  options: readonly PickerOption<Value>[];
  selected?: Value;
  onChoose: (value: Value) => void;
  icon: Icon;
  label: string;
  title?: string;
  /** The value shown is a default: muted, with a D on its icon. */
  isDefault?: boolean;
  /** The D goes beside the icon, its room kept when there is none (see ValueMark). */
  markBeside?: boolean;
  /** The value shown is the person's own choice: accent color. */
  chosen?: boolean;
  /** Sets every tool of a group: dashed and bold. */
  bulk?: boolean;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === selected);
  const content = useListOpensWhole(open);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SettingsSelectField
          aria-label={name}
          className={cn(
            'h-7 gap-[7px] pr-[7px] pl-2',
            bulk && 'border-dashed bg-transparent',
            className,
          )}
          disabled={disabled}
          icon={
            <ValueMark
              beside={markBeside}
              icon={icon}
              isDefault={isDefault}
              className={cn(chosen && 'text-primary', iconClassName)}
            />
          }
          role="combobox"
          title={title}
          value={
            <span
              className={cn(
                isDefault && 'text-muted-foreground',
                chosen && 'text-primary',
                bulk && 'font-semibold',
              )}
            >
              {label}
              {isDefault ? <span className="sr-only">{t`, default`}</span> : null}
            </span>
          }
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[19.5rem] gap-0 overflow-hidden p-0" ref={content}>
        <Command className="rounded-none! p-0" defaultValue={current?.label} loop>
          <CommandInput aria-label={search} placeholder={search} />
          <CommandList className="max-h-96 p-1">
            <CommandEmpty>{t`No choice matches.`}</CommandEmpty>
            {options.map((option) => (
              <OptionItem
                key={option.value}
                onSelect={() => {
                  setOpen(false);
                  if (option.value !== selected) onChoose(option.value);
                }}
                option={option}
                selected={option.value === selected}
                value={option.label}
              />
            ))}
          </CommandList>
          <MenuKeyHints hints={MENU_HINTS} />
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function OptionItem<Value extends string>({
  option,
  selected,
  value,
  onSelect,
}: {
  option: PickerOption<Value>;
  selected: boolean;
  value: string;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      className="min-h-11 items-start py-1.5"
      data-checked={selected}
      keywords={[option.label, option.description]}
      onSelect={onSelect}
      value={value}
    >
      <option.icon aria-hidden="true" className="mt-0.5 text-muted-foreground" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{option.label}</span>
          {option.isDefault ? (
            <span className="shrink-0 text-xs text-muted-foreground">{t`Default`}</span>
          ) : null}
        </span>
        <span className="truncate text-xs text-muted-foreground" title={option.description}>
          {option.description}
        </span>
      </span>
    </CommandItem>
  );
}

export interface PickerGroup {
  heading: string;
  options: readonly PickerOption<string>[];
  selected?: string;
  onChoose: (value: string) => void;
}

export interface PickerAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * A narrow table's summary row: its › opens one picker with every choice the
 * row's columns hold, grouped, plus the row's own actions. The button
 * stretches over its row (the row must be `relative`).
 */
export function SummaryPicker({
  name,
  search,
  groups,
  actions = [],
  detail,
  disabled = false,
  className,
}: {
  /** The button's accessible name ("Permission and I/O: get_states"). */
  name: string;
  search: string;
  groups: readonly PickerGroup[];
  actions?: readonly PickerAction[];
  /** What the row's columns folded away: the name, description and facts. */
  detail?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const content = useListOpensWhole(open);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={name}
          className={cn(
            'grid size-6 place-items-center rounded-md text-muted-foreground outline-none after:absolute after:inset-0 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60',
            className,
          )}
          disabled={disabled}
          title={name}
          type="button"
        >
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[19.5rem] gap-0 overflow-hidden p-0" ref={content}>
        {detail ? (
          <div className="grid gap-1 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {detail}
          </div>
        ) : null}
        <Command className="rounded-none! p-0" loop>
          <CommandInput aria-label={search} placeholder={search} />
          <CommandList className="max-h-80 p-1">
            <CommandEmpty>{t`No choice matches.`}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup heading={group.heading} key={group.heading}>
                {group.options.map((option) => (
                  <OptionItem
                    key={option.value}
                    onSelect={() => {
                      setOpen(false);
                      if (option.value !== group.selected) group.onChoose(option.value);
                    }}
                    option={option}
                    selected={option.value === group.selected}
                    value={`${group.heading}: ${option.label}`}
                  />
                ))}
              </CommandGroup>
            ))}
            {actions.length ? (
              <CommandGroup heading={t`More`}>
                {actions.map((action) => (
                  <CommandItem
                    disabled={action.disabled}
                    key={action.label}
                    onSelect={() => {
                      setOpen(false);
                      action.onSelect();
                    }}
                    value={action.label}
                  >
                    <span className="truncate" title={action.label}>
                      {action.label}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          <MenuKeyHints hints={MENU_HINTS} />
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** "Outcomes in [Ask first]": which approval mode's outcomes the table shows. */
export function OutcomeModeField({
  modes,
  value,
  onChange,
  className,
}: {
  modes: readonly string[];
  value: string;
  onChange: (mode: string) => void;
  className?: string;
}) {
  const id = useId();
  const known = SESSION_APPROVAL_OPTIONS.filter((option) => modes.includes(option.value));
  const other = modes
    .filter((mode) => !known.some((option) => option.value === mode))
    .map((mode) => ({ value: mode, label: mode, description: '', icon: HelpIcon }));
  const options = [...known, ...other];
  const current = options.find((option) => option.value === value);
  return (
    // Capped at its row: when the label and picker don't fit side by side, the
    // picker moves under the label instead of pushing the page wider.
    <span
      className={cn(
        'flex max-w-full min-w-0 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1',
        className,
      )}
    >
      <span className="text-xs whitespace-nowrap text-muted-foreground" id={id}>
        {t`Outcomes in`}
      </span>
      <ChoicePicker
        className="h-[1.875rem] w-44 max-w-full pl-2.5"
        icon={current?.icon ?? HelpIcon}
        label={modeLabel(value)}
        name={t`Outcomes in`}
        onChoose={onChange}
        options={options}
        search={t`Approval mode`}
        selected={value}
      />
    </span>
  );
}

/** "Filter tools" with its `/` key. */
export function ToolFilterField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <label
      className={cn(
        'flex h-[1.875rem] min-w-0 items-center gap-2 rounded-md border border-input bg-input/30 pr-1 pl-2.5 text-menu focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
        className,
      )}
      // With text in the field, the first Esc clears it; the window closes only on the next.
      data-escape-scope={value ? '' : undefined}
    >
      <SearchIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        {...identifierInputProps}
        aria-label={t`Filter tools`}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:appearance-none"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.stopPropagation();
            onChange('');
          }
        }}
        placeholder={t`Filter tools`}
        ref={input}
        type="search"
        value={value}
      />
      <span aria-hidden="true" title={t`Press / to filter`}>
        <KeyCap>/</KeyCap>
      </span>
    </label>
  );
}

/** What the D on a value means. */
export function DefaultLegend() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-[7px] text-xs whitespace-nowrap text-muted-foreground"
      title={t`D marks a default value. Choose a value to override it.`}
    >
      <ValueMark className="text-faint" icon={HelpIcon} isDefault />
      {t`Default`}
    </span>
  );
}

export function ToolTableFooter() {
  return (
    <p className="flex h-9 min-w-0 items-center gap-2.5 text-xs whitespace-nowrap text-muted-foreground">
      <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">
        {t`Choices save at once. A ✓ shows for 2 s, an error stays on the row.`}
      </span>
    </p>
  );
}
