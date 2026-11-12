import { type ReactNode, useContext } from 'react';
import { SettingsScopeContext } from '@/lib/settings-scope-context';
import { NARROW_HIDDEN } from '@/lib/settings-fold';
import { InfoTip } from './info-tip';
import { SettingsScopeIcon } from './settings-scope-icon';

export interface SettingsSectionHeadingProps {
  title: string;
  /** A visible subtitle. Prefer `info` for explanation (labels and state only on the page). */
  description?: string;
  /** Explanatory text behind an info icon beside the title. */
  info?: string;
  eyebrow?: string;
  /** 2 for a section folded into another page (Browser in Execution & history). */
  level?: 1 | 2;
  /** Right end of the title row: the page's view switch (segmented) or its one action. */
  actions?: ReactNode;
}

/** Page title (serif, ⓘ beside it), its view switch at the right, and the scope line below. */
export function SettingsSectionHeading({
  title,
  description,
  info,
  eyebrow,
  level = 1,
  actions,
}: SettingsSectionHeadingProps) {
  const pageScope = useContext(SettingsScopeContext);
  const scope = level === 1 ? pageScope : undefined;
  const Heading = level === 1 ? 'h1' : 'h2';
  // Pages show labels and state; explanation sits behind the ⓘ beside the title.
  const hint = info && description ? `${description} ${info}` : (info ?? description);
  return (
    // A div, not <header>: outside a <main> that is a banner landmark, and the
    // window's content region already holds it.
    <div className={level === 1 ? 'mb-2' : undefined}>
      {eyebrow ? <p className="mb-2 text-xs font-medium text-muted-foreground">{eyebrow}</p> : null}
      <div className="flex h-[1.875rem] min-w-0 items-center gap-2 whitespace-nowrap">
        {/* The info control sits beside the heading so the heading's name is the title alone. */}
        <Heading
          className={
            level === 1
              ? 'min-w-0 truncate font-heading text-[1.0625rem] font-semibold'
              : 'min-w-0 truncate font-heading text-[0.9375rem] font-semibold'
          }
        >
          {title}
        </Heading>
        {hint ? (
          <InfoTip className={NARROW_HIDDEN} label={`About ${title}`}>
            {hint}
          </InfoTip>
        ) : null}
        {actions ? (
          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 font-sans">
            {actions}
          </div>
        ) : null}
      </div>
      {scope ? (
        <p
          className="mt-0.5 flex min-w-0 items-center gap-[0.3125rem] text-xs whitespace-nowrap text-faint"
          data-slot="settings-scope"
        >
          <SettingsScopeIcon className="size-[0.8125rem] shrink-0" group={scope.group} />
          <span className="min-w-0 truncate">{scope.line}</span>
        </p>
      ) : null}
    </div>
  );
}
