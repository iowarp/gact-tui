import type { ReactNode } from 'react';

export function Rows({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div aria-label={label} className="h-full overflow-y-auto p-1" role="list">
      {children}
    </div>
  );
}

export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-7 items-end px-2 pb-1 text-caption font-semibold text-muted-foreground"
      role="listitem"
    >
      {children}
    </div>
  );
}
