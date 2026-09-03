import type { WorkspaceReference } from '@clio/core/v3';
import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input';
import { cn } from '@/lib/utils';
import { referenceKindLabel, workspaceReferenceIdentity } from '@/lib/composer-reference-domain';

export interface InlineReferenceSelection {
  offset: number;
  reference: WorkspaceReference;
}

interface ComposerInlineReferenceEditorProps {
  className?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onOpenReference?: (reference: WorkspaceReference) => void;
  onReferencesChange: (references: InlineReferenceSelection[]) => void;
  placeholder: string;
  references: readonly InlineReferenceSelection[];
  value: string;
}

function modelSignature(value: string, references: readonly InlineReferenceSelection[]): string {
  return JSON.stringify([
    value,
    references.map(({ offset, reference }) => [workspaceReferenceIdentity(reference), offset]),
  ]);
}

function appendToken(root: HTMLDivElement, selection: InlineReferenceSelection): void {
  const identity = workspaceReferenceIdentity(selection.reference);
  const token = document.createElement('span');
  token.className =
    'mx-0.5 inline-flex max-w-64 items-center gap-1 align-baseline rounded-md bg-secondary px-1.5 py-0.5 text-sm text-secondary-foreground';
  token.contentEditable = 'false';
  token.dataset.referenceToken = identity;

  const open = document.createElement('button');
  open.className =
    'min-w-0 truncate font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  open.dataset.referenceOpen = identity;
  open.setAttribute(
    'aria-label',
    `Open ${referenceKindLabel(selection.reference.kind)} ${selection.reference.label}`,
  );
  open.title = selection.reference.detail;
  open.type = 'button';
  open.textContent = `@${selection.reference.label}`;

  const remove = document.createElement('button');
  remove.className =
    'shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  remove.dataset.referenceRemove = identity;
  remove.setAttribute('aria-label', `Remove ${selection.reference.label}`);
  remove.type = 'button';
  remove.textContent = '×';

  token.append(open, remove);
  root.append(token);
}

function writeModel(
  root: HTMLDivElement,
  value: string,
  references: readonly InlineReferenceSelection[],
): void {
  root.replaceChildren();
  const ordered = references
    .map((selection, index) => ({ ...selection, index }))
    .sort((left, right) => left.offset - right.offset || left.index - right.index);
  let cursor = 0;
  for (const selection of ordered) {
    const offset = Math.max(cursor, Math.min(selection.offset, value.length));
    if (offset > cursor) root.append(document.createTextNode(value.slice(cursor, offset)));
    appendToken(root, selection);
    cursor = offset;
  }
  if (cursor < value.length) root.append(document.createTextNode(value.slice(cursor)));
}

function readModel(
  root: HTMLDivElement,
  references: readonly InlineReferenceSelection[],
): { references: InlineReferenceSelection[]; value: string } {
  const byIdentity = new Map(
    references.map((selection) => [workspaceReferenceIdentity(selection.reference), selection]),
  );
  const nextReferences: InlineReferenceSelection[] = [];
  let value = '';

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      value += node.textContent ?? '';
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const identity = node.dataset.referenceToken;
    if (identity) {
      const selection = byIdentity.get(identity);
      if (selection) nextReferences.push({ ...selection, offset: value.length });
      return;
    }
    if (node.tagName === 'BR') {
      value += '\n';
      return;
    }
    const startedAt = value.length;
    for (const child of node.childNodes) visit(child);
    if (node.tagName === 'DIV' && value.length > startedAt && !value.endsWith('\n')) value += '\n';
  };

  for (const child of root.childNodes) visit(child);
  return { references: nextReferences, value };
}

function sameReferences(
  left: readonly InlineReferenceSelection[],
  right: readonly InlineReferenceSelection[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (selection, index) =>
        selection.offset === right[index]?.offset &&
        workspaceReferenceIdentity(selection.reference) ===
          workspaceReferenceIdentity(right[index]!.reference),
    )
  );
}

function focusEditorAtEnd(editor: HTMLDivElement | null): void {
  if (!editor || editor.getAttribute('aria-disabled') === 'true') return;
  editor.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export const ComposerInlineReferenceEditor = forwardRef<
  HTMLDivElement,
  ComposerInlineReferenceEditorProps
>(function ComposerInlineReferenceEditor(
  {
    className,
    disabled = false,
    onChange,
    onKeyDown,
    onOpenReference,
    onReferencesChange,
    placeholder,
    references,
    value,
  },
  forwardedRef,
) {
  const attachments = usePromptInputAttachments();
  const localRef = useRef<HTMLDivElement | null>(null);
  const renderedSignature = useRef('');

  useLayoutEffect(() => {
    const root = localRef.current;
    const signature = modelSignature(value, references);
    if (!root || renderedSignature.current === signature) return;
    writeModel(root, value, references);
    renderedSignature.current = signature;
  }, [references, value]);

  const setRef = (element: HTMLDivElement | null) => {
    localRef.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  };

  const syncModel = (root: HTMLDivElement) => {
    const next = readModel(root, references);
    renderedSignature.current = modelSignature(next.value, next.references);
    onChange(next.value);
    if (!sameReferences(next.references, references)) onReferencesChange(next.references);
  };

  const handleInput = (event: FormEvent<HTMLDivElement>) => syncModel(event.currentTarget);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const open = event.target.closest<HTMLButtonElement>('[data-reference-open]');
    const remove = event.target.closest<HTMLButtonElement>('[data-reference-remove]');
    const identity = open?.dataset.referenceOpen ?? remove?.dataset.referenceRemove;
    if (!identity) return;
    const selected = references.find(
      ({ reference }) => workspaceReferenceIdentity(reference) === identity,
    );
    if (!selected) return;
    if (remove) {
      onReferencesChange(
        references.filter(({ reference }) => workspaceReferenceIdentity(reference) !== identity),
      );
      window.requestAnimationFrame(() => focusEditorAtEnd(localRef.current));
      return;
    }
    onOpenReference?.(selected.reference);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) files.push(...Array.from(event.clipboardData?.files ?? []));
    if (files.length) {
      event.preventDefault();
      attachments.add(files);
      return;
    }

    const text = event.clipboardData.getData('text/plain');
    const selection = window.getSelection();
    if (!text || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!event.currentTarget.contains(range.commonAncestorContainer)) return;
    event.preventDefault();
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    syncModel(event.currentTarget);
  };

  return (
    <>
      <input name="message" type="hidden" value={value} />
      <div
        aria-disabled={disabled}
        aria-label={placeholder}
        aria-multiline="true"
        aria-placeholder={placeholder}
        className={cn(
          'field-sizing-content max-h-48 min-h-16 w-full flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-3 py-2 text-sm outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
        contentEditable={!disabled}
        data-placeholder={placeholder}
        data-slot="input-group-control"
        onClick={handleClick}
        onInput={handleInput}
        onKeyDown={onKeyDown}
        onPaste={handlePaste}
        ref={setRef}
        role="textbox"
        suppressContentEditableWarning
        tabIndex={disabled ? -1 : 0}
      />
    </>
  );
});
