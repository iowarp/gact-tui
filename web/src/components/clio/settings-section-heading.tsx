import { InfoTip } from './info-tip';

export interface SettingsSectionHeadingProps {
  title: string;
  /** A visible subtitle. Prefer `info` for explanation (labels and state only on the page). */
  description?: string;
  /** Explanatory text behind an info icon beside the title. */
  info?: string;
  eyebrow?: string;
}

export function SettingsSectionHeading({
  title,
  description,
  info,
  eyebrow = 'Settings',
}: SettingsSectionHeadingProps) {
  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h1 className="mt-2 flex items-center gap-2 text-4xl font-semibold tracking-tight">
        {title}
        {info ? <InfoTip label={`About ${title}`}>{info}</InfoTip> : null}
      </h1>
      {description ? (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}
