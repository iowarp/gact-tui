import type { ScienceEntry, ScienceStudy } from '@clio/core/v3';
import {
  FolderOpenIcon,
  ListIcon,
  ListTreeIcon,
  MessageSquareTextIcon,
  TextQuoteIcon,
} from 'lucide-react';
import { copyText } from '@/lib/clipboard';
import { attempt, type CopyTake, type OpenTake, type TakeRow } from './file-viewer-take-hooks';
import { entryText, type StudyNode } from './science-log-model';
import { t } from '@lingui/core/macro';

export interface ScienceLogTakeOptions {
  study: ScienceStudy;
  /** The entries the log shows now. */
  shown: readonly ScienceEntry[];
  /** The selected entry, when one is. */
  entry?: ScienceEntry;
  /** The picked topic, whose task and folder Open reaches first. */
  topic?: StudyNode;
  /** In the graph, the selection can be shown in the log. */
  onShowInLog?: () => void;
  onViewInTranscript?: (entry: ScienceEntry) => void;
  onOpenTask?: (handle: string) => void;
  onOpenFolder?: (path: string) => void;
  folderAvailable?: (path: string) => boolean;
}

/** The Science log's Copy ▾ (the selected entry or the shown log) and Open ▾ rows. */
export function scienceLogTake({
  study,
  shown,
  entry,
  topic,
  onShowInLog,
  onViewInTranscript,
  onOpenTask,
  onOpenFolder,
  folderAvailable,
}: ScienceLogTakeOptions): { copy: CopyTake; open?: OpenTake } {
  const copyEntry = () => {
    if (entry) void attempt(() => copyText(entryText(entry)), t`Copied the entry.`);
  };
  const copyLog = () =>
    void attempt(() => copyText(shown.map(entryText).join('\n\n')), t`Copied the log.`);
  const copy: CopyTake = {
    rows: [
      {
        id: 'entry',
        label: t`Entry`,
        icon: <TextQuoteIcon aria-hidden="true" />,
        ...(entry ? { onSelect: copyEntry } : { reason: t`Select an entry` }),
      },
      { id: 'log', label: t`Log`, icon: <ListIcon aria-hidden="true" />, onSelect: copyLog },
    ],
    face: entry ? { label: t`Copy entry`, run: copyEntry } : { label: t`Copy log`, run: copyLog },
  };
  // The picked topic's branch first, else the selected entry's, else the study's own.
  const branch = study.branches.find(
    (candidate) =>
      candidate.session_id ===
      (topic?.branch ?? entry?.branch ?? (study.root_session_id || study.session_id)),
  );
  const handle = topic?.handle ?? branch?.handle;
  const folder = topic?.folder ?? branch?.node_folder;
  const rows: TakeRow[] = [];
  if (onShowInLog)
    rows.push({
      id: 'show-in-log',
      label: t`Show in log`,
      icon: <ListIcon aria-hidden="true" />,
      onSelect: onShowInLog,
    });
  if (entry?.invocation && onViewInTranscript)
    rows.push({
      id: 'transcript',
      label: t`View in transcript`,
      icon: <MessageSquareTextIcon aria-hidden="true" />,
      onSelect: () => onViewInTranscript(entry),
    });
  if (handle && onOpenTask)
    rows.push({
      id: 'task',
      label: t`Open task`,
      icon: <ListTreeIcon aria-hidden="true" />,
      onSelect: () => onOpenTask(handle),
    });
  if (folder && onOpenFolder) {
    const available = folderAvailable?.(folder) ?? true;
    rows.push({
      id: 'folder',
      label: t`Open folder`,
      icon: <FolderOpenIcon aria-hidden="true" />,
      ...(available ? { onSelect: () => onOpenFolder(folder) } : { reason: t`Not available here` }),
    });
  }
  const first = rows.find((row) => row.onSelect);
  if (!first?.onSelect) return { copy };
  return {
    copy,
    open: {
      rows,
      face: { label: first.label, run: first.onSelect, icon: first.icon },
      busy: false,
    },
  };
}
