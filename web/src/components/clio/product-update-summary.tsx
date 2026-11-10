import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDashedIcon,
  DownloadIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProductUpdateState =
  | 'unknown'
  | 'checking'
  | 'current'
  | 'available'
  | 'unavailable'
  | 'error';
/** Consistent status icon for update notices. */
export function ProductUpdateIcon({ state }: { state: ProductUpdateState }) {
  if (state === 'checking') {
    return (
      <LoaderCircleIcon aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
    );
  }
  if (state === 'current') {
    return <CheckCircle2Icon aria-hidden="true" className="size-4 shrink-0 text-success" />;
  }
  if (state === 'unknown') {
    return (
      <CircleDashedIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    );
  }
  if (state === 'available') {
    return <DownloadIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />;
  }
  return (
    <CircleAlertIcon
      aria-hidden="true"
      className={cn(
        'size-4 shrink-0',
        state === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
    />
  );
}
