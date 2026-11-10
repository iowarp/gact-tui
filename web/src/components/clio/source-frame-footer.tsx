import type { ReactNode } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SourceFrameFooterContext,
  type SourceFooter,
  type SourceFooterRegister,
} from './use-source-frame-footer';

export function SourceFrameFooterProvider({
  register,
  children,
}: {
  register: SourceFooterRegister;
  children: ReactNode;
}) {
  return (
    <SourceFrameFooterContext.Provider value={register}>
      {children}
    </SourceFrameFooterContext.Provider>
  );
}

/** The frame's left footer action (Back, Disconnect): a quiet ghost button. */
export function SourceFooterStart({ start }: { start: NonNullable<SourceFooter['start']> }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 text-muted-foreground hover:text-foreground"
      disabled={start.disabled}
      onClick={start.onClick}
    >
      {start.back ? <ArrowLeftIcon aria-hidden="true" /> : null}
      {start.label}
    </Button>
  );
}

/** The frame's second finishing action, beside Cancel. */
export function SourceFooterSecondary({
  secondary,
}: {
  secondary: NonNullable<SourceFooter['secondary']>;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={secondary.disabled}
      onClick={secondary.onClick}
    >
      {secondary.label}
    </Button>
  );
}
