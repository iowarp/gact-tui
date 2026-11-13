import type { Workspace } from '@clio/core/v3';
import { CheckIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { memoryScopeOptions, type MemoryPickerOption } from './memory-document-helpers';
import { SettingsSelectField } from './model-select-field';
import { PickerFooter } from './primitives/picker-footer';
import { t } from '@lingui/core/macro';

export interface MemoryScopeOptions {
  workspaces: Workspace[];
  workspacesLoading?: boolean;
  workspacesError?: string;
  onRetryWorkspaces?: () => void;
}

/** A select-shaped field that opens the one searchable Picker. */
export function MemoryPicker({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  searchPlaceholder,
  emptyLabel = t`Nothing matches`,
  placeholder,
  status,
}: {
  id?: string;
  /** The field's accessible name ("Remember in"). */
  label: string;
  value: string;
  options: readonly MemoryPickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  searchPlaceholder: string;
  emptyLabel?: string;
  /** Shown when no option is chosen (or the field stands for a fixed answer). */
  placeholder?: string;
  /** A loading or failure line inside the picker, above the options. */
  status?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SettingsSelectField
          aria-label={label}
          disabled={disabled}
          icon={chosen?.icon}
          id={id}
          placeholder={placeholder}
          title={chosen?.label ?? placeholder}
          value={chosen?.label}
          wrap
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 gap-0 overflow-hidden p-0"
      >
        <Command
          filter={(itemValue, search) =>
            (options.find((option) => option.value === itemValue)?.label ?? itemValue)
              .toLowerCase()
              .includes(search.trim().toLowerCase())
              ? 1
              : 0
          }
          label={label}
        >
          <CommandInput placeholder={searchPlaceholder} />
          {status}
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                data-checked={option.value === value || undefined}
                key={option.value}
                onSelect={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                value={option.value}
              >
                {option.icon ? (
                  <span aria-hidden="true" className="grid shrink-0 text-muted-foreground">
                    {option.icon}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate" title={option.label}>
                  {option.label}
                </span>
                {option.value === value ? (
                  <CheckIcon aria-hidden="true" className="ml-auto shrink-0" />
                ) : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        <PickerFooter
          hints={[
            { label: t`Move`, shortcut: 'menu-move' },
            { label: t`Choose`, shortcut: 'menu-pick' },
            { label: t`Close`, shortcut: 'menu-close', onSelect: () => setOpen(false) },
          ]}
        />
      </PopoverContent>
    </Popover>
  );
}

/** One account/workspace destination picker for manual memories and imports. */
export function MemoryScopePicker({
  id,
  value,
  onChange,
  disabled,
  workspaces,
  workspacesLoading,
  workspacesError,
  onRetryWorkspaces,
}: MemoryScopeOptions & {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <MemoryPicker
      disabled={disabled}
      emptyLabel={t`No workspace matches`}
      id={id}
      label={t`Remember in`}
      onChange={onChange}
      options={memoryScopeOptions(workspaces)}
      searchPlaceholder={t`Search workspaces…`}
      status={
        workspacesLoading ? (
          <p className="px-3 py-1.5 text-xs text-muted-foreground" role="status">
            {t`Loading workspaces…`}
          </p>
        ) : workspacesError ? (
          <p
            className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-xs text-destructive"
            role="alert"
          >
            <span className="min-w-0 truncate" title={workspacesError}>
              {t`Workspaces could not be loaded. ${workspacesError}`}
            </span>
            <button
              className="shrink-0 text-foreground underline-offset-4 hover:underline"
              onClick={onRetryWorkspaces}
              type="button"
            >
              {t`Retry`}
            </button>
          </p>
        ) : null
      }
      value={value}
    />
  );
}
