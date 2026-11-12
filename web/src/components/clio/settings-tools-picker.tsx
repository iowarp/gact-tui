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

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const MENU_HINTS = [
  { id: 'menu-move', label: 'move' },
  { id: 'menu-pick', label: 'choose' },
  { id: 'menu-close', label: 'close' },
] as const;
/** An icon with a small D when its value is a default. */
export function ValueMark({
  icon: Glyph,
  isDefault,
  className,
}: {
  icon: Icon;
  isDefault: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-grid size-[15px] shrink-0 place-items-center"
    >
      <Glyph className={cn('size-3.5', className)} />
      {isDefault ? (
        <b className="absolute -right-1.5 -bottom-[5px] rounded-[3px] bg-faint/70 px-[2px] py-px text-[0.53125rem] leading-none font-bold text-foreground">
          D
        </b>
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
              {isDefault ? <span className="sr-only">, default</span> : null}
            </span>
          }
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[19.5rem] gap-0 overflow-hidden p-0">
        <Command className="rounded-none! p-0" defaultValue={current?.label} loop>
          <CommandInput aria-label={search} placeholder={search} />
          <CommandList className="max-h-80 p-1">
            <CommandEmpty>No choice matches.</CommandEmpty>
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
          {option.isDefault ? <span className="shrink-0 text-xs text-faint">Default</span> : null}
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
      <PopoverContent align="end" className="w-[19.5rem] gap-0 overflow-hidden p-0">
        {detail ? (
          <div className="grid gap-1 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {detail}
          </div>
        ) : null}
        <Command className="rounded-none! p-0" loop>
          <CommandInput aria-label={search} placeholder={search} />
          <CommandList className="max-h-80 p-1">
            <CommandEmpty>No choice matches.</CommandEmpty>
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
              <CommandGroup heading="More">
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
    <span className={cn('flex min-w-0 shrink-0 items-center gap-2.5', className)}>
      <span className="text-xs whitespace-nowrap text-muted-foreground" id={id}>
        Outcomes in
      </span>
      <ChoicePicker
        className="h-[1.875rem] w-44 pl-2.5"
        icon={current?.icon ?? HelpIcon}
        label={modeLabel(value)}
        name="Outcomes in"
        onChoose={onChange}
        options={options}
        search="Approval mode"
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
        aria-label="Filter tools"
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:appearance-none"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.stopPropagation();
            onChange('');
          }
        }}
        placeholder="Filter tools"
        ref={input}
        type="search"
        value={value}
      />
      <span aria-hidden="true" title="Press / to filter">
        <KeyCap>/</KeyCap>
      </span>
    </label>
  );
}

/** What the D on a value means. */
export function DefaultLegend() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-[7px] text-xs whitespace-nowrap text-faint"
      title="D marks a default value. Choose a value to override it."
    >
      <ValueMark className="text-faint" icon={HelpIcon} isDefault />
      Default
    </span>
  );
}

export function ToolTableFooter() {
  return (
    <p className="flex h-9 min-w-0 items-center gap-2.5 text-xs whitespace-nowrap text-faint">
      <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">
        Choices save at once. A ✓ shows for 2 s, an error stays on the row.
      </span>
    </p>
  );
}
