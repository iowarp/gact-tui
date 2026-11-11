import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** What a source view puts in its frame's footer: the confirm, and a quiet action at the left. */
export interface SourceFooter {
  confirm?: { label: string; disabled?: boolean; tone?: 'default' | 'destructive' };
  onConfirm?: () => void;
  start?: { label: string; onClick: () => void; disabled?: boolean; back?: boolean };
  /** A second way to finish, left of Cancel (Download a copy beside Link). */
  secondary?: { label: string; onClick: () => void; disabled?: boolean };
}

export type SourceFooterRegister = (footer: SourceFooter | undefined) => void;
export const SourceFrameFooterContext = createContext<SourceFooterRegister | null>(null);

/** The frame holds the current footer; its views register theirs. */
export function useSourceFrameFooterHost() {
  const [footer, setFooter] = useState<SourceFooter>();
  return { footer, setFooter };
}

/**
 * Publishes a view's footer to the dialog frame, which owns Ctrl+Enter. Without
 * a frame it returns the same buttons as an inline row, with no key hint because
 * nothing there handles the key. Handlers are read through refs, so registering
 * only re-renders the frame when a label or state changes.
 */
export function useSourceFrameFooter(footer: SourceFooter): ReactNode {
  const register = useContext(SourceFrameFooterContext);
  const confirmRef = useRef(footer.onConfirm);
  const startRef = useRef(footer.start?.onClick);
  const secondaryRef = useRef(footer.secondary?.onClick);
  useLayoutEffect(() => {
    confirmRef.current = footer.onConfirm;
    startRef.current = footer.start?.onClick;
    secondaryRef.current = footer.secondary?.onClick;
  });
  const confirmLabel = footer.confirm?.label;
  const confirmDisabled = footer.confirm?.disabled;
  const confirmTone = footer.confirm?.tone;
  const startLabel = footer.start?.label;
  const startDisabled = footer.start?.disabled;
  const startBack = footer.start?.back;
  const secondaryLabel = footer.secondary?.label;
  const secondaryDisabled = footer.secondary?.disabled;
  useLayoutEffect(() => {
    if (!register) return;
    register({
      confirm:
        confirmLabel === undefined
          ? undefined
          : { label: confirmLabel, disabled: confirmDisabled, tone: confirmTone },
      onConfirm: () => confirmRef.current?.(),
      start:
        startLabel === undefined
          ? undefined
          : {
              label: startLabel,
              disabled: startDisabled,
              back: startBack,
              onClick: () => startRef.current?.(),
            },
      secondary:
        secondaryLabel === undefined
          ? undefined
          : {
              label: secondaryLabel,
              disabled: secondaryDisabled,
              onClick: () => secondaryRef.current?.(),
            },
    });
  }, [
    register,
    confirmLabel,
    confirmDisabled,
    confirmTone,
    startLabel,
    startDisabled,
    startBack,
    secondaryLabel,
    secondaryDisabled,
  ]);
  useLayoutEffect(() => (register ? () => register(undefined) : undefined), [register]);
  if (register) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t pt-2.5">
      {footer.start ? (
        <Button
          type="button"
          variant="ghost"
          className="mr-auto"
          disabled={footer.start.disabled}
          onClick={footer.start.onClick}
        >
          {footer.start.back ? <ArrowLeftIcon aria-hidden="true" /> : null}
          {footer.start.label}
        </Button>
      ) : null}
      {footer.secondary ? (
        <Button
          type="button"
          variant="outline"
          disabled={footer.secondary.disabled}
          onClick={footer.secondary.onClick}
        >
          {footer.secondary.label}
        </Button>
      ) : null}
      {footer.confirm ? (
        <Button
          type="button"
          variant={footer.confirm.tone === 'destructive' ? 'destructive' : 'default'}
          disabled={footer.confirm.disabled}
          onClick={footer.onConfirm}
        >
          {footer.confirm.label}
        </Button>
      ) : null}
    </div>
  );
}
