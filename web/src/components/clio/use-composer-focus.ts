import { useEffect, useRef, type RefObject } from 'react';
import { focusEditorAtOffset as focusComposerEditor } from './composer-editor-model';

/**
 * Where the composer's caret goes on its own: on a focus request, on mount
 * (`autoFocus`), and back into the editor once a submit has settled.
 */
export function useComposerFocus({
  inputRef,
  focusRequestKey,
  autoFocus,
  disabled,
}: {
  inputRef: RefObject<HTMLDivElement | null>;
  focusRequestKey?: number;
  autoFocus: boolean;
  disabled?: boolean;
}) {
  const handledFocusRequestKeyRef = useRef(focusRequestKey);
  const restoreFocusAfterSubmitRef = useRef(false);

  useEffect(() => {
    const previousKey = handledFocusRequestKeyRef.current;
    handledFocusRequestKeyRef.current = focusRequestKey;
    if (focusRequestKey === undefined || focusRequestKey === previousKey) return;
    const frame = window.requestAnimationFrame(() => focusComposerEditor(inputRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestKey, inputRef]);

  const autoFocusRef = useRef(autoFocus);
  useEffect(() => {
    if (!autoFocusRef.current) return undefined;
    if (window.matchMedia?.('(pointer: coarse)').matches) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      focusComposerEditor(inputRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inputRef]);

  useEffect(() => {
    if (disabled || !restoreFocusAfterSubmitRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element || element.getAttribute('aria-disabled') === 'true') return;
      restoreFocusAfterSubmitRef.current = false;
      focusComposerEditor(element);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [disabled, inputRef]);

  const restoreInputFocusWhenReady = () => {
    window.requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element || element.getAttribute('aria-disabled') === 'true') return;
      restoreFocusAfterSubmitRef.current = false;
      focusComposerEditor(element);
    });
  };
  return { restoreFocusAfterSubmitRef, restoreInputFocusWhenReady };
}
