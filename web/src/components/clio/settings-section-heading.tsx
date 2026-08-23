export interface SettingsSectionHeadingProps {
  title: string;
  description: string;
  eyebrow?: string;
}

export function SettingsSectionHeading({
  title,
  description,
  eyebrow = 'Settings',
}: SettingsSectionHeadingProps) {
  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </header>
  );
}
