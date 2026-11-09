import { CheckIcon, SearchIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ComponentType, type SVGProps } from 'react';
import {
  Command,
  CommandEmpty,
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
        <b className="absolute -right-1.5 -bottom-[5px] rounded-[3px] bg-faint/70 px-[2px] py-px text-[8.5px] leading-none font-bold text-foreground">
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
            // Below 32rem the table is summary rows: pickers drop their field frame.
            '@max-[32rem]/tools:border-transparent @max-[32rem]/tools:bg-transparent @max-[32rem]/tools:px-0 @max-[32rem]/tools:[&>svg:last-child]:hidden',
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
          <CommandInput placeholder={search} />
          <CommandList className="max-h-80 p-1">
            <CommandEmpty>No choice matches.</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                className="min-h-11 items-start py-1.5"
                data-checked={option.value === selected}
                key={option.value}
                keywords={[option.description]}
                onSelect={() => {
                  setOpen(false);
                  if (option.value !== selected) onChoose(option.value);
                }}
                value={option.label}
              >
                <option.icon aria-hidden="true" className="mt-0.5 text-muted-foreground" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{option.label}</span>
                    {option.isDefault ? (
                      <span className="shrink-0 text-xs text-faint">Default</span>
                    ) : null}
                  </span>
                  <span
                    className="truncate text-xs text-muted-foreground"
                    title={option.description}
                  >
                    {option.description}
                  </span>
                </span>
              </CommandItem>
            ))}
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
        'flex h-[1.875rem] min-w-0 items-center gap-2 rounded-md border border-input bg-input/30 pr-1 pl-2.5 text-[0.78125rem] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
        className,
      )}
    >
      <SearchIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <input
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
