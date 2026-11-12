import { useEffect, useRef, type RefObject } from 'react';
import { focusEditorAtOffset as focusComposerEditor } from './composer-editor-model';

/**
 * Takes a draft another surface offers (`clio:use-message-draft`) into the
 * composer. A newer draft from the same source replaces the one it inserted.
 */
export function useComposerDraftInsertion({
  input,
  latestInputRef,
  setInput,
  inputRef,
}: {
  input: string;
  latestInputRef: RefObject<string>;
  setInput: (value: string) => void;
  inputRef: RefObject<HTMLDivElement | null>;
}) {
  const lastInsertedDraftRef = useRef<{ sourceKey: string; text: string } | undefined>(undefined);
  useEffect(() => {
    const useDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; sourceKey?: string }>).detail;
      if (typeof detail?.text !== 'string') return;
      const current = latestInputRef.current;
      const previous = lastInsertedDraftRef.current;
      const replacePrevious =
        previous && detail.sourceKey === previous.sourceKey && current.includes(previous.text);
      setInput(
        replacePrevious
          ? current.replace(previous.text, detail.text)
          : current
            ? `${current}\n\n${detail.text}`
            : detail.text,
      );
      if (detail.sourceKey)
        lastInsertedDraftRef.current = { sourceKey: detail.sourceKey, text: detail.text };
      window.requestAnimationFrame(() => focusComposerEditor(inputRef.current));
    };
    window.addEventListener('clio:use-message-draft', useDraft);
    return () => {
      window.removeEventListener('clio:use-message-draft', useDraft);
    };
  }, [input, setInput, latestInputRef, inputRef]);
}
