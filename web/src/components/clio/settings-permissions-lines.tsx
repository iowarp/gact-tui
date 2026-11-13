import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** One faint line under a group label: the empty state of a list. */
export function GroupEmptyLine({ children }: { children: ReactNode }) {
  return (
    <p
      className="truncate border-b border-border/70 px-2 py-2.5 text-xs text-muted-foreground max-[599px]:whitespace-normal"
      data-announce-state=""
      title={typeof children === 'string' ? children : undefined}
    >
      {children}
    </p>
  );
}

/** A plain-language load failure under a group label, with an inline Retry. */
export function GroupErrorLine({
  children,
  onRetry,
  retrying = false,
}: {
  children: ReactNode;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <p
      className="flex min-w-0 items-center gap-2 border-b border-border/70 px-2 py-2 text-xs text-destructive"
      role="alert"
    >
      <span className="min-w-0 truncate">{children}</span>
      <Button
        className="h-auto shrink-0 p-0 text-xs"
        disabled={retrying}
        onClick={onRetry}
        size="xs"
        variant="link"
      >
        {retrying ? 'Retrying' : 'Retry'}
      </Button>
    </p>
  );
}
