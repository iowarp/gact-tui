import { DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { SessionBehaviorOption } from './session-behavior-options';

/** A behavior choice with a compact label and a fully wrapped explanation. */
export function BehaviorMenuItem<T extends string>({
  destructive,
  disabled,
  option,
  title,
}: {
  destructive?: boolean;
  disabled?: boolean;
  option: SessionBehaviorOption<T>;
  title?: string;
}) {
  const Icon = option.icon;
  return (
    <DropdownMenuRadioItem
      className={cn('items-start', destructive && 'text-destructive focus:text-destructive')}
      disabled={disabled}
      title={title}
      value={option.value}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{option.label}</span>
        <span className="block whitespace-normal break-words text-xs font-normal text-muted-foreground">
          {option.description}
        </span>
      </span>
    </DropdownMenuRadioItem>
  );
}
