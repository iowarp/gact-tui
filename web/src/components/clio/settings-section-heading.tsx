import { useContext } from 'react';
import { SettingsScopeContext } from '@/lib/settings-scope-context';
import { InfoTip } from './info-tip';

export interface SettingsSectionHeadingProps {
  title: string;
  /** A visible subtitle. Prefer `info` for explanation (labels and state only on the page). */
  description?: string;
  /** Explanatory text behind an info icon beside the title. */
  info?: string;
  eyebrow?: string;
  /** 2 for a section folded into another page (Browser in Execution & history). */
  level?: 1 | 2;
}

export function SettingsSectionHeading({
  title,
  description,
  info,
  eyebrow,
  level = 1,
}: SettingsSectionHeadingProps) {
  const pageScope = useContext(SettingsScopeContext);
  const scope = level === 1 ? pageScope : undefined;
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <header>
      {eyebrow ? <p className="mb-2 text-xs font-medium text-muted-foreground">{eyebrow}</p> : null}
      <div className="flex min-w-0 items-center gap-2">
        {/* The info control sits beside the heading so the heading's name is the title alone. */}
        <Heading
          className={
            level === 1
              ? 'truncate text-xl font-semibold tracking-tight'
              : 'truncate text-base font-semibold'
          }
        >
          {title}
        </Heading>
        {info ? <InfoTip label={`About ${title}`}>{info}</InfoTip> : null}
      </div>
      {scope ? (
        <p className="mt-1 truncate text-xs text-muted-foreground" data-slot="settings-scope">
          {scope}
        </p>
      ) : null}
      {description ? (
        <p className="mt-2 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}
