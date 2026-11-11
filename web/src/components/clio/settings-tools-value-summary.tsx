import { cn } from '@/lib/utils';
import type { Icon } from './settings-tools-options';
import { ValueMark } from './settings-tools-picker';

/** A value a summary row shows in its sub line: the mark, D for a default, and the word. */
export function ValueSummary({
  icon,
  label,
  isDefault,
  chosen,
  className,
  title,
}: {
  icon: Icon;
  label: string;
  isDefault: boolean;
  chosen: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-2',
        chosen ? 'text-primary' : 'text-muted-foreground',
        className,
      )}
      title={title}
    >
      <ValueMark icon={icon} isDefault={isDefault} />
      {label}
      {isDefault ? <span className="sr-only">, default</span> : null}
    </span>
  );
}
