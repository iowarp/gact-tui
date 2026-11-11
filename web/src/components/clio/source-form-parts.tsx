import type { SourceProviderId } from '@clio/core/v3';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SegmentedControl } from './primitives/segmented-control';
import { sourceAccessRows, type SourceAccess } from './source-access';

/** The spec's mono provider glyphs (`#folder`, `#kterm`, `#github`, `#gdrive`, `#cloud`, `#obsidian`, `#db`). */
const glyphPaths: Record<SourceProviderId | 'upload', ReactNode> = {
  local: (
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  ),
  upload: (
    <>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <path d="M12 10v6M9 13l3-3 3 3" />
    </>
  ),
  sftp: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </>
  ),
  github: (
    <>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </>
  ),
  google_drive: (
    <>
      <path d="M8.5 3h7L22 14l-3.5 6.5h-13L2 14z" />
      <path d="M8.5 3 15 14H2M15.5 3 9 14M22 14h-7l-3.5 6.5" />
    </>
  ),
  globus: <path d="M17.5 19H8a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19z" />,
  obsidian: (
    <>
      <path d="M9.5 2 4 10.5 7 20l6 2.5 7-7.5L16.5 3z" />
      <path d="M9.5 2 11 11l-4 9M11 11l9 4" />
    </>
  ),
  ndp: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0" />
    </>
  ),
};

/** A provider as a 16px stroke glyph, the language of the connect form's Source switch. */
export function SourceProviderGlyph({
  provider,
  className,
}: {
  provider: SourceProviderId | 'upload';
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-4 shrink-0', className)}
    >
      {glyphPaths[provider]}
    </svg>
  );
}

/** The spec's `.c3f`: an 11.5px muted label over its control, with an optional faint hint. */
export function SourceField({
  label,
  htmlFor,
  aside,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  /** Faint text at the label's right (`.lab .r2`). */
  aside?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const Label = htmlFor ? 'label' : 'div';
  return (
    <div className={cn('flex min-w-0 flex-col gap-[5px]', className)}>
      {/* The aside stays outside the label so its controls never join the field's name. */}
      <div className="flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
        <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
          {label}
        </Label>
        {aside ? (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-faint">{aside}</span>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-[11px] leading-[1.45] text-faint">{hint}</p> : null}
    </div>
  );
}

/** The spec's `.c3in` 30px field face, applied to the shared Input. */
export const sourceInputClass = 'h-[30px] rounded-[7px] px-2.5 text-[12.5px] md:text-[12.5px]';

/** The spec's `.c3r` radio rows: a ring, a name, and a faint second line. */
export function ChoiceRows<T extends string>({
  label,
  rows,
  value,
  onChange,
  unavailable = {},
  disabled = false,
}: {
  label: string;
  rows: ReadonlyArray<{ value: T; label: string; detail?: string }>;
  value: T;
  onChange: (value: T) => void;
  /** Rows that cannot be chosen, with why. */
  unavailable?: Partial<Record<T, string>>;
  disabled?: boolean;
}) {
  return (
    <SourceField label={label}>
      <RadioGroupPrimitive.Root
        aria-label={label}
        value={value}
        disabled={disabled}
        onValueChange={(next) => onChange(next as T)}
        className="-mx-2 flex flex-col"
      >
        {rows.map((row) => {
          const reason = unavailable[row.value];
          return (
            <RadioGroupPrimitive.Item
              key={row.value}
              value={row.value}
              disabled={Boolean(reason)}
              title={reason ?? (row.detail ? `${row.label}: ${row.detail}` : row.label)}
              className="group flex min-h-[30px] w-full items-center gap-[9px] rounded-[6px] px-2 py-[3px] text-left text-[12.5px] whitespace-nowrap text-foreground outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent"
            >
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--faint)] group-data-[state=checked]:shadow-[inset_0_0_0_4px_var(--primary)]"
              />
              <span className="flex min-w-0 flex-1 flex-col overflow-hidden leading-[1.3]">
                <span className="truncate">{row.label}</span>
                {row.detail || reason ? (
                  <small className="line-clamp-2 text-[11px] whitespace-normal text-faint [overflow-wrap:anywhere]">
                    {reason ?? row.detail}
                  </small>
                ) : null}
              </span>
            </RadioGroupPrimitive.Item>
          );
        })}
      </RadioGroupPrimitive.Root>
    </SourceField>
  );
}

/**
 * The spec's Access list: the same three rows everywhere. A row the source
 * cannot offer stays visible, disabled, with the reason as its second line.
 */
export function AccessRows(props: {
  value: SourceAccess;
  onChange: (value: SourceAccess) => void;
  unavailable?: Partial<Record<SourceAccess, string>>;
  disabled?: boolean;
}) {
  return <ChoiceRows label="Access" rows={sourceAccessRows} {...props} />;
}

/**
 * A chosen folder in the `.c3in` face: the folder's name, then its full path
 * cut at the end (whole path in the title), with its chooser as a quiet action at the right.
 */
export function FolderFace({
  path,
  empty = 'No folder chosen',
  children,
}: {
  path: string;
  empty?: string;
  /** The chooser (a HostPathPicker with `triggerClassName`). */
  children?: ReactNode;
}) {
  const name = path
    .trim()
    .replace(/[/\\]+$/, '')
    .split(/[/\\]/)
    .pop();
  return (
    <div className="flex h-[30px] min-w-0 items-center gap-2 rounded-[7px] border border-input pr-1 pl-2.5 text-[12.5px] dark:bg-input/30">
      <span
        role="status"
        title={path || undefined}
        className="flex min-w-0 flex-1 items-baseline gap-2 whitespace-nowrap"
      >
        {path ? (
          <>
            <span className="max-w-[60%] shrink-0 truncate text-foreground">{name || path}</span>
            {name && name !== path ? (
              <span className="min-w-0 truncate font-mono text-[11px] text-faint">{path}</span>
            ) : null}
          </>
        ) : (
          <span className="truncate text-faint">{empty}</span>
        )}
      </span>
      {children}
    </div>
  );
}

/** The quiet chooser inside a FolderFace. */
export const folderTriggerClass = 'h-6 shrink-0 px-2 text-[12px] text-muted-foreground';

const statusTones = {
  default: 'text-foreground/85',
  ok: 'text-foreground/85 [&_[data-lead]_svg]:text-primary',
  error: 'text-destructive [&_[data-lead]_svg]:text-destructive',
  warning: 'text-warning [&_[data-lead]_svg]:text-warning',
  quiet: 'text-faint',
} as const;

/** The spec's `.c3s` status line: a lead icon, one sentence, actions at the right. No box. */
export function SourceStatusLine({
  icon,
  tone = 'default',
  children,
  actions,
  role,
  className,
}: {
  icon?: ReactNode;
  tone?: keyof typeof statusTones;
  children: ReactNode;
  actions?: ReactNode;
  role?: 'status' | 'alert';
  className?: string;
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex min-h-[26px] min-w-0 items-center gap-2 text-[12px]',
        statusTones[tone],
        className,
      )}
    >
      {icon ? (
        <span
          data-lead=""
          aria-hidden="true"
          className="grid size-3.5 shrink-0 place-items-center [&_svg]:size-3.5 [&_svg]:text-muted-foreground"
        >
          {icon}
        </span>
      ) : null}
      <span
        className="line-clamp-2 min-w-0 flex-1 leading-[1.35] [overflow-wrap:anywhere]"
        title={typeof children === 'string' ? children : undefined}
      >
        {children}
      </span>
      {actions ? (
        <span className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</span>
      ) : null}
    </div>
  );
}

export type SourceChoiceId = SourceProviderId | 'upload';

/** The spec's Source row: an icon toggle of providers, each named on hover, then the chosen name. */
export function ProviderSwitch({
  options,
  value,
  onChange,
  aside,
}: {
  options: ReadonlyArray<{ id: SourceChoiceId; name: string }>;
  value: SourceChoiceId;
  onChange: (value: SourceChoiceId) => void;
  /** About the chosen provider, at the label's right. */
  aside?: ReactNode;
}) {
  return (
    <SourceField label="Source" aside={aside}>
      <div className="flex min-w-0 items-center gap-1.5">
        <SegmentedControl
          label="Source"
          iconOnly
          value={value}
          onValueChange={onChange}
          options={options.map((option) => ({
            value: option.id,
            label: option.name,
            icon: <SourceProviderGlyph provider={option.id} />,
          }))}
        />
        <span className="ml-1.5 line-clamp-2 min-w-0 text-[12.5px] leading-[1.3] text-foreground">
          {options.find((option) => option.id === value)?.name}
        </span>
      </div>
    </SourceField>
  );
}
