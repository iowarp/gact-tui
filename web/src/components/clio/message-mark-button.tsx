import { BookmarkIcon, LoaderCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconButton } from './primitives/icon-button';

/** A saved navigation mark; it does not change or submit conversation content. */
export function MessageMarkButton({
  marked,
  pending,
  onMark,
  className,
}: {
  marked: boolean;
  pending?: boolean;
  onMark: (marked: boolean) => void | Promise<void>;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <IconButton
      aria-pressed={marked}
      className={cn(marked && 'text-foreground', className)}
      disabled={pending || saving}
      icon={
        saving ? (
          <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
        ) : (
          <BookmarkIcon aria-hidden="true" fill={marked ? 'currentColor' : 'none'} />
        )
      }
      label={marked ? 'Unmark message' : 'Mark message'}
      onClick={() => {
        setSaving(true);
        void Promise.resolve()
          .then(() => onMark(!marked))
          .catch(() => {
            // The mutation reports the service error; keep the saved state unchanged.
          })
          .finally(() => setSaving(false));
      }}
      size="sm"
      type="button"
    />
  );
}
