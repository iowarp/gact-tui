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
  eyebrow,
}: SettingsSectionHeadingProps) {
  return (
    <header>
      {eyebrow ? <p className="mb-2 text-xs font-medium text-muted-foreground">{eyebrow}</p> : null}
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        {title}
        {info ? <InfoTip label={`About ${title}`}>{info}</InfoTip> : null}
      </h1>
      {description ? (
        <p className="mt-2 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}
