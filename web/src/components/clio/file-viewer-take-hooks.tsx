import { useQuery } from '@tanstack/react-query';
import {
  AppWindowIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderOpenIcon,
  FolderTreeIcon,
  GitBranchIcon,
  GlobeIcon,
  LinkIcon,
} from 'lucide-react';
import { useContext, useState, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import type { WorkspaceReference } from '@clio/core/v3';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useOpenFileInBrowser } from '@/hooks/use-open-file-in-browser';
import { useRepository } from '@/hooks/use-repository';
import { copyText } from '@/lib/clipboard';
import {
  addReferenceToComposer,
  useComposerReferenceAvailable,
} from '@/lib/composer-reference-requests';
import { isHtmlFile } from '@/lib/html-in-browser';
import { isTextMediaType } from '@/lib/media-types';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useLiveStore } from '@/store/live-store';
import { documentApplications, openFileBytes, revealFileBytes } from '@/tauri/documents';
import { AssociatedApplicationItems } from './associated-application-items';
import type { FileViewerAction, FileViewerContentsReader } from './file-viewer-action-context';
import {
  fileViewerAbsolutePath,
  fileViewerCrumbs,
  fileViewerWorkspacePath,
} from './file-viewer-location';
import {
  fileViewerIdentity,
  readFileViewerBytes,
  type FileViewerSource,
} from './file-viewer-source';
import { PresentationNavigation } from './presentation-navigation';
import type { FrameCrumb } from './primitives/frame-bar';
import { downloadBytes } from './surface-export';

/** One row of a Take menu (Copy ▾, Open ▾), shared by the split button and the narrow … menu. */
export interface TakeRow {
  id: string;
  label: string;
  icon: ReactNode;
  accelerator?: string;
  /** Why the row is unavailable, shown beside it. */
  reason?: string;
  separatorBefore?: boolean;
  onSelect?: () => void;
  /** Rows of a submenu instead of an action. */
  submenu?: ReactNode;
}

/** Copy ▾: its face and its rows. */
export interface CopyTake {
  rows: readonly TakeRow[];
  face: { label: string; run: () => void };
}

/** Open ▾: its face, its rows and whether an open is under way. */
export interface OpenTake {
  rows: readonly TakeRow[];
  face: { label: string; run: () => void; icon: ReactNode };
  busy: boolean;
}

export interface AddToMessage {
  onSelect: () => void;
  /** Why it cannot be added here. */
  reason?: string;
}

/**
 * @ Add to message: the reference into this workspace's open composer, the
 * same one its @ picker inserts. Ctrl Shift Enter does the same in `region`.
 */
export function useAddToMessage(
  reference: WorkspaceReference | undefined,
  workspaceId: string | undefined,
  region: RefObject<Element | null>,
): AddToMessage {
  const composerOpen = useComposerReferenceAvailable(workspaceId);
  const reason = !reference
    ? 'Not a workspace file'
    : !composerOpen
      ? 'Open a conversation to add it to a message'
      : undefined;
  const onSelect = () => {
    if (reference && addReferenceToComposer(reference, workspaceId))
      toast.success(`Added ${reference.label} to the message.`);
  };
  useShortcut('add-to-message', onSelect, { enabled: !reason, region });
  return { reason, onSelect };
}

export async function attempt(work: () => Promise<unknown>, done?: string) {
  try {
    await work();
    if (done) toast.success(done);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'That did not work.');
  }
}

function useWorkspaceRoot(workspaceId: string | undefined) {
  return useLiveStore((state) =>
    workspaceId ? state.entities.workspaces[workspaceId]?.path : undefined,
  );
}

/** The frame bar's Where for a file: its crumbs, each folder opening in Files when Files is here. */
export function useFileViewerCrumbs(source: FileViewerSource): FrameCrumb[] {
  const navigation = useContext(PresentationNavigation);
  const root = useWorkspaceRoot(source.workspaceId);
  const openFolder = navigation?.onOpenFolder;
  return fileViewerCrumbs(source, root).map(({ label, folder }) => ({
    label,
    onSelect: folder !== undefined && openFolder ? () => openFolder(folder) : undefined,
  }));
}

/**
 * Copy ▾: the face copies the contents (the shown text, a text file's text or
 * a PNG image); the menu adds the paths. A binary file's face copies its path.
 */
export function useCopyTake(
  source: FileViewerSource,
  contents?: FileViewerContentsReader,
): CopyTake {
  const repository = useRepository();
  const identity = fileViewerIdentity(source);
  const root = useWorkspaceRoot(source.workspaceId);
  const relative = fileViewerWorkspacePath(source, root);
  const absolute = fileViewerAbsolutePath(source, root);
  const image = identity.mediaType === 'image/png' && typeof ClipboardItem !== 'undefined';
  const contentsReason = !identity.available
    ? 'Not available'
    : contents || isTextMediaType(identity.mediaType) || image
      ? undefined
      : 'Not text';
  const copyContents = () =>
    attempt(async () => {
      if (contents) {
        const text = await contents();
        if (text === undefined) throw new Error('The file text is not available yet.');
        return copyText(text);
      }
      const bytes = await readFileViewerBytes(repository, source);
      if (image) {
        const blob = new Blob([bytes as BlobPart], { type: identity.mediaType });
        return navigator.clipboard.write([new ClipboardItem({ [identity.mediaType]: blob })]);
      }
      return copyText(new TextDecoder().decode(bytes));
    }, 'Copied the contents.');
  const copyValue = (value: string, done: string) => attempt(() => copyText(value), done);
  const rows: TakeRow[] = [
    {
      id: 'contents',
      label: 'Contents',
      icon: <FileTextIcon />,
      accelerator: 'C',
      reason: contentsReason,
      onSelect: () => void copyContents(),
    },
    {
      id: 'absolute',
      label: 'Absolute path',
      icon: <LinkIcon />,
      accelerator: 'A',
      reason: absolute ? undefined : 'Workspace folder unknown',
      onSelect: () => absolute && void copyValue(absolute, 'Copied the absolute path.'),
    },
    {
      id: 'workspace',
      label: 'Relative to workspace',
      icon: <FolderTreeIcon />,
      accelerator: 'W',
      reason: relative ? undefined : 'Not in this workspace',
      onSelect: () => relative && void copyValue(relative, 'Copied the workspace path.'),
    },
    {
      id: 'repository',
      label: 'Relative to repo',
      icon: <GitBranchIcon />,
      accelerator: 'R',
      reason: 'Repository root unknown',
    },
  ];
  const fallback = relative ?? identity.name;
  const face = contentsReason
    ? { label: 'Copy path', run: () => void copyValue(fallback, 'Copied the path.') }
    : { label: 'Copy contents', run: () => void copyContents() };
  return { rows, face };
}

/**
 * Open ▾: the face opens the file in the system app (the desktop app) or a
 * browser tab (the web app); the menu adds Show in Files, the download of the
 * original bytes and the renderer's alternate formats as Export to… rows.
 */
export function useOpenTake(
  source: FileViewerSource,
  formats: readonly FileViewerAction[],
  {
    otherApps = true,
    tab,
    rows: renderer = [],
  }: {
    /** The document workspace lists the apps for its working copy itself. */
    otherApps?: boolean;
    /** Opens the file in a workbench tab: the face, when the frame shows something else. */
    tab?: () => void;
    /** The renderer's own places (a document's working-copy apps), after the system app. */
    rows?: readonly FileViewerAction[];
  } = {},
): OpenTake {
  const repository = useRepository();
  const navigation = useContext(PresentationNavigation);
  const openInBrowser = useOpenFileInBrowser();
  const identity = fileViewerIdentity(source);
  const native = inTauri();
  const root = useWorkspaceRoot(source.workspaceId);
  const relative = fileViewerWorkspacePath(source, root);
  const fileName = identity.name.split(/[\\/]/u).at(-1) || identity.name;
  const [busy, setBusy] = useState(false);
  const applications = useQuery({
    queryKey: ['document-applications', identity.name, identity.mediaType],
    queryFn: () => documentApplications(identity.name, identity.mediaType),
    enabled: native && identity.available,
    staleTime: 60_000,
  });
  const bytes = () => readFileViewerBytes(repository, source);
  const run = (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    void attempt(work, done).finally(() => setBusy(false));
  };
  const openWith = (id: string) =>
    run(
      async () => openFileBytes(fileName, await bytes(), id),
      'Opened a desktop copy of the file.',
    );
  const reveal = () =>
    run(async () => revealFileBytes(fileName, await bytes()), 'Desktop copy shown in its folder.');
  const systemApp = () => {
    const apps = applications.data ?? [];
    const app = apps.find((candidate) => candidate.is_default) ?? apps[0];
    if (app) openWith(app.id);
    else reveal();
  };
  const browserTarget =
    isHtmlFile(identity.name, identity.mediaType) && source.kind !== 'provided'
      ? source.kind === 'artifact'
        ? { artifact_id: source.artifact.id }
        : relative
          ? { path: relative }
          : undefined
      : undefined;
  const browserTab = () => {
    if (browserTarget) return run(() => openInBrowser(browserTarget, identity.name));
    const tab = window.open('about:blank', '_blank');
    run(async () => {
      if (!tab) throw new Error('The browser blocked the new tab.');
      tab.opener = null;
      const url = URL.createObjectURL(
        new Blob([(await bytes()) as BlobPart], { type: identity.mediaType }),
      );
      tab.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  };
  const folder = relative?.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : '';
  const unavailable = identity.available ? undefined : 'Not available';
  const rows: TakeRow[] = [
    ...(tab
      ? [{ id: 'tab', label: 'In a tab', icon: <FileTextIcon />, accelerator: 'T', onSelect: tab }]
      : []),
    {
      id: 'browser',
      label: 'In a browser tab',
      icon: <GlobeIcon />,
      accelerator: 'B',
      reason: unavailable,
      onSelect: browserTab,
    },
    {
      id: 'system',
      label: 'In the system app',
      icon: <AppWindowIcon />,
      accelerator: 'S',
      reason: unavailable ?? (native ? undefined : 'Needs the desktop app'),
      onSelect: systemApp,
    },
    ...(native && identity.available && otherApps
      ? [
          {
            id: 'with',
            label: 'With another app',
            icon: <ExternalLinkIcon />,
            submenu: (
              <>
                <AssociatedApplicationItems
                  applications={applications.data ?? []}
                  pending={applications.isPending}
                  error={applications.error?.message}
                  disabled={busy}
                  onSelect={(app) => openWith(app.id)}
                />
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={busy} onSelect={reveal}>
                  <FolderOpenIcon aria-hidden="true" />
                  Open in folder
                </DropdownMenuItem>
              </>
            ),
          },
        ]
      : []),
    ...renderer.map(
      (action): TakeRow => ({
        id: `open:${action.label}`,
        label: action.label,
        icon: <action.icon aria-hidden="true" />,
        reason: action.disabled ? (action.description ?? 'Not available') : undefined,
        submenu: action.submenu,
        onSelect: action.submenu ? undefined : () => run(async () => action.onSelect()),
      }),
    ),
    {
      id: 'files',
      label: 'Show in Files',
      icon: <FolderTreeIcon />,
      accelerator: 'F',
      reason: !navigation?.onOpenFolder
        ? 'Files is not open here'
        : relative === undefined
          ? 'Not in this workspace'
          : undefined,
      onSelect: () => navigation?.onOpenFolder?.(folder),
    },
    {
      id: 'download',
      label: 'Download',
      icon: <DownloadIcon />,
      accelerator: 'D',
      reason: unavailable,
      separatorBefore: true,
      onSelect: () =>
        run(async () => downloadBytes(await bytes(), identity.mediaType, identity.name)),
    },
    ...formats.map(
      (action): TakeRow => ({
        id: `export:${action.label}`,
        label: `Export to ${action.label}`,
        icon: <action.icon aria-hidden="true" />,
        reason: action.disabled ? (action.description ?? 'Not available') : unavailable,
        onSelect: () => run(async () => action.onSelect()),
      }),
    ),
  ];
  const face = tab
    ? { label: 'Open the file', run: tab, icon: <ExternalLinkIcon aria-hidden="true" /> }
    : native
      ? {
          label: 'Open in the system app',
          run: systemApp,
          icon: <AppWindowIcon aria-hidden="true" />,
        }
      : {
          label: 'Open in a browser tab',
          run: browserTab,
          icon: <ExternalLinkIcon aria-hidden="true" />,
        };
  return { rows, face, busy: busy || renderer.some((action) => action.pending) };
}
