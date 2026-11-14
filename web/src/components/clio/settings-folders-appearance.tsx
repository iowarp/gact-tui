import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { SettingsSelectField } from './model-select-field';
import { WORKSPACE_COLOURS, WORKSPACE_ICONS, workspaceIcon } from './settings-folders-model';
import { t } from '@lingui/core/macro';

/** The workspace colour as a row of swatches; each names itself on hover and to a screen reader. */
export function ColourSwatches({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (colour: string) => void;
  disabled?: boolean;
}) {
  const move = (from: number, step: number) => {
    const next =
      WORKSPACE_COLOURS[(from + step + WORKSPACE_COLOURS.length) % WORKSPACE_COLOURS.length];
    onChange(next.id);
    document.getElementById(`folders-colour-${next.id}`)?.focus();
  };
  return (
    <div
      aria-label={t`Colour`}
      className="flex shrink-0 items-center gap-[0.5625rem]"
      data-slot="workspace-colours"
      role="radiogroup"
    >
      {WORKSPACE_COLOURS.map((colour, index) => {
        const checked = colour.id === value;
        return (
          <button
            aria-checked={checked}
            aria-label={colour.label}
            className={cn(
              'grid size-4 shrink-0 place-items-center rounded-[0.3125rem] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60',
              colour.swatch,
              checked && 'ring-1 ring-foreground ring-offset-2 ring-offset-background',
            )}
            disabled={disabled}
            id={`folders-colour-${colour.id}`}
            key={colour.id}
            onClick={() => onChange(colour.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(index, -1);
              }
            }}
            role="radio"
            tabIndex={checked ? 0 : -1}
            title={colour.label}
            type="button"
          />
        );
      })}
    </div>
  );
}

/** The workspace icon as a select field with the icon's glyph and name. */
export function IconSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (icon: string) => void;
  disabled?: boolean;
}) {
  const current = workspaceIcon(value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <SettingsSelectField
          // In rem like its text, so a larger interface size keeps the icon's name whole.
          className="w-[9.375rem] max-w-full"
          icon={<current.Icon />}
          id={id}
          title={current.label}
          value={current.label}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9.375rem]">
        <DropdownMenuRadioGroup onValueChange={onChange} value={current.id}>
          {WORKSPACE_ICONS.map(({ id: icon, label, Icon }) => (
            <DropdownMenuRadioItem key={icon} value={icon}>
              <Icon aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
