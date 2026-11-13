import { CornerUpLeftIcon } from 'lucide-react';
import { useRef } from 'react';
import type { SavedDraft } from '@/lib/composer-saved-drafts';
import { DeleteIcon } from '@/lib/icon-vocabulary';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { IconButton } from './primitives/icon-button';
import { Tag } from './primitives/tag';
import { TruncatedText } from './primitives/truncate';
import { t } from '@lingui/core/macro';

export interface SavedDraftRowProps {
  draft: SavedDraft;
  /** The newest draft, which Up in an empty composer brings back. */
  latest: boolean;
  onRestore: () => void;
  onDelete: () => void;
}

/**
 * A draft put aside with Ctrl+S, on the queue's 28px line: Saved, the text
 * cut to one line, and its verbs. It is never sent; Restore (or Up in an
 * empty composer, for the newest) puts it back in the editor.
 */
export function SavedDraftRow({ draft, latest, onDelete, onRestore }: SavedDraftRowProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const text = draft.text.trim();
  useShortcut(
    'queue-delete',
    () => {
      const row = rowRef.current;
      const neighbour = row?.nextElementSibling ?? row?.previousElementSibling;
      if (neighbour instanceof HTMLElement) neighbour.focus();
      onDelete();
    },
    { region: rowRef },
  );
  return (
    <li
      className="group/saved-row flex h-7 min-w-0 items-center gap-1.5 rounded-[6px] pr-0.5 pl-1 text-ui whitespace-nowrap hover:bg-hover focus-within:bg-hover"
      data-queue-live-item=""
      data-slot="composer-saved-draft"
      ref={rowRef}
      tabIndex={-1}
    >
      <Tag title={t`Saved for later, not sent`} tone="chip" width="auto">
        {t`Saved`}
      </Tag>
      <span className="flex min-w-0 flex-1">
        {text ? (
          <TruncatedText className="text-foreground">{text}</TruncatedText>
        ) : (
          <TruncatedText className="text-muted-foreground">{t`References only`}</TruncatedText>
        )}
      </span>
      <span
        className="invisible flex shrink-0 items-center gap-0.5 group-hover/saved-row:visible group-focus-within/saved-row:visible pointer-coarse:visible"
        data-slot="saved-draft-actions"
      >
        <IconButton
          icon={<DeleteIcon />}
          label={t`Delete saved draft`}
          onClick={onDelete}
          shortcut="queue-delete"
          size="sm"
        />
      </span>
      <IconButton
        icon={<CornerUpLeftIcon />}
        label={t`Back to the composer`}
        onClick={onRestore}
        shortcut={latest ? 'restore-draft' : undefined}
        size="sm"
      />
    </li>
  );
}
