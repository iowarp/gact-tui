import type { MemoryDocument, Workspace } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import {
  BookOpenIcon,
  BrainIcon,
  FileTextIcon,
  FolderIcon,
  LaptopIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { createElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { AdjustIcon } from '@/lib/icon-vocabulary';
import { downloadBlob } from './surface-export';
import { plural, t } from '@lingui/core/macro';
import { formatLocale } from '@/lib/locale-format';

const TIME_FORMAT = new Intl.DateTimeFormat(formatLocale(), {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** The one date and time format on the Memory page. */
export function memoryTime(stamp: string | undefined): string {
  return stamp && !Number.isNaN(Date.parse(stamp))
    ? TIME_FORMAT.format(new Date(stamp))
    : t`Time not recorded`;
}

/** A failure in plain words: never an HTTP status line. */
export function memoryErrorText(error: unknown): string {
  const status =
    typeof error === 'object' && error && 'status' in error && typeof error.status === 'number'
      ? error.status
      : undefined;
  const message = error instanceof Error ? error.message.trim() : '';
  if (status === 404) return t`The connected agent does not offer this memory.`;
  if (status === 401 || status === 403) return t`This connection may not change memory.`;
  if (!message || /request failed|\bhttp\b|\b[45]\d\d\b/iu.test(message))
    return status && status >= 500
      ? t`The agent could not finish this.`
      : t`The agent could not be reached.`;
  return message;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  profile: UserRoundIcon,
  preferences: AdjustIcon,
  areas: BrainIcon,
  topics: BookOpenIcon,
  environments: LaptopIcon,
  people: UsersIcon,
};

/** The glyph of a memory category, shared by the list rows and the detail pane. */
export function memoryCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category] ?? FileTextIcon;
}

/** A document's name as people read it: its description, else its slug in words. */
export function memoryDocumentTitle(document: Pick<MemoryDocument, 'description' | 'slug'>) {
  return document.description || document.slug.replaceAll('-', ' ');
}

export const liveFactCount = (document: MemoryDocument) =>
  document.facts.filter((fact) => fact.live).length;

export const factCountLabel = (count: number) => plural(count, { one: '# fact', other: '# facts' });

/** "Account" for account memory, else the workspace's name. */
export function memoryScopeTitle(scope: string, workspaceNames: ReadonlyMap<string, string>) {
  if (scope === 'user') return t`Account`;
  const id = scope.replace(/^project\//u, '');
  return workspaceNames.get(id) ?? id;
}

export interface MemoryPickerOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

/** Account first, then each workspace that can keep its own memory. */
export function memoryScopeOptions(workspaces: readonly Workspace[]): MemoryPickerOption[] {
  return [
    { value: 'user', label: t`Account (across workspaces)`, icon: createElement(UserRoundIcon) },
    ...workspaces
      .filter((workspace) => workspace.id !== 'ws_global')
      .map((workspace) => ({
        value: `project/${workspace.id}`,
        label: workspace.name,
        icon: createElement(FolderIcon),
      })),
  ];
}

/** Saves a memory export (zip bytes) under a name derived from what was exported. */
export function saveMemoryArchive(bytes: Uint8Array, scope: string) {
  const stem = scope === 'all' ? 'memory' : `memory-${scope.replaceAll('/', '-')}`;
  downloadBlob(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }), `${stem}.zip`);
}

/** Download one document as a memory export. */
export function useMemoryDocumentExport() {
  const repository = useRepository();
  return useMutation({
    mutationFn: (name: string) =>
      repository.exportMemory({ name }).then((bytes) => ({ bytes, name })),
    onSuccess: ({ bytes, name }) => saveMemoryArchive(bytes, name),
    onError: (error) => toast.error(memoryErrorText(error)),
  });
}
