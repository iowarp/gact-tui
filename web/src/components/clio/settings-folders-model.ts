import type { Workspace, WorkspaceSourceFolder } from '@clio/core/v3';
import {
  BookOpenIcon,
  ChartLineIcon,
  CodeIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  FolderIcon,
  GlobeIcon,
  MicroscopeIcon,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useSyncExternalStore } from 'react';

/** The colours a workspace can carry: the spec's fixed identity palette, the same in every theme. */
export const WORKSPACE_COLOURS = [
  { id: 'clay', label: 'Clay', swatch: 'bg-[#c9785b]' },
  { id: 'amber', label: 'Amber', swatch: 'bg-[#d9a55b]' },
  { id: 'green', label: 'Green', swatch: 'bg-[#7fb069]' },
  { id: 'blue', label: 'Blue', swatch: 'bg-[#5b9fd9]' },
  { id: 'violet', label: 'Violet', swatch: 'bg-[#a07fd1]' },
] as const;

export const WORKSPACE_ICONS: ReadonlyArray<{ id: string; label: string; Icon: LucideIcon }> = [
  { id: 'folder', label: 'Folder', Icon: FolderIcon },
  { id: 'flask', label: 'Lab', Icon: FlaskConicalIcon },
  { id: 'microscope', label: 'Microscope', Icon: MicroscopeIcon },
  { id: 'database', label: 'Data', Icon: DatabaseIcon },
  { id: 'chart', label: 'Analysis', Icon: ChartLineIcon },
  { id: 'globe', label: 'Earth', Icon: GlobeIcon },
  { id: 'code', label: 'Code', Icon: CodeIcon },
  { id: 'book', label: 'Notes', Icon: BookOpenIcon },
];

export interface WorkspaceAppearance {
  colour: string;
  icon: string;
}

export const DEFAULT_APPEARANCE: WorkspaceAppearance = { colour: 'amber', icon: 'folder' };

export const workspaceIcon = (id: string) =>
  WORKSPACE_ICONS.find((icon) => icon.id === id) ?? WORKSPACE_ICONS[0];

const STORAGE_KEY = 'clio.workspace-appearance.v1';
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Record<string, Partial<WorkspaceAppearance>> } = {
  raw: null,
  value: {},
};

function readAll(): Record<string, Partial<WorkspaceAppearance>> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cache.value;
  }
  if (raw === cache.raw) return cache.value;
  let value: Record<string, Partial<WorkspaceAppearance>> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') value = parsed as typeof value;
  } catch {
    value = {};
  }
  cache = { raw, value };
  return value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const appearanceKey = (endpoint: string, workspaceId: string) => `${endpoint} ${workspaceId}`;

/**
 * A workspace's colour and icon, kept on this device for the connection's
 * workspace (the workspace record carries neither).
 */
export function useWorkspaceAppearance(endpoint: string, workspaceId: string | undefined) {
  const all = useSyncExternalStore(subscribe, readAll, readAll);
  const stored = workspaceId ? all[appearanceKey(endpoint, workspaceId)] : undefined;
  const appearance: WorkspaceAppearance = {
    colour: stored?.colour ?? DEFAULT_APPEARANCE.colour,
    icon: stored?.icon ?? DEFAULT_APPEARANCE.icon,
  };
  const save = useCallback(
    (next: WorkspaceAppearance) => {
      if (!workspaceId) return;
      const value = { ...readAll(), [appearanceKey(endpoint, workspaceId)]: next };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      listeners.forEach((listener) => listener());
    },
    [endpoint, workspaceId],
  );
  return { appearance, save };
}

export function folderName(path: string): string {
  return (
    path
      .split(/[\\/]+/u)
      .filter(Boolean)
      .at(-1) ||
    path ||
    'Workspace folder'
  );
}

const cleanPath = (path: string) => path.trim().replace(/[\\/]+$/u, '');
export const samePath = (a: string, b: string) =>
  cleanPath(a).replaceAll('\\', '/').toLocaleLowerCase() ===
  cleanPath(b).replaceAll('\\', '/').toLocaleLowerCase();

/** The workspace's own folder and the folders it may also write, as the editor reads them. */
export function workspaceFolders(workspace: Workspace): {
  primary: WorkspaceSourceFolder;
  additional: WorkspaceSourceFolder[];
} {
  const folders = workspace.source_folders ?? [];
  return {
    primary: folders.find((folder) => folder.primary) ?? {
      name: folderName(workspace.path),
      path: workspace.path,
      primary: true,
    },
    additional: folders.filter((folder) => !folder.primary),
  };
}

/** Why a typed folder cannot be allowed, or undefined when it can. */
export function folderPathProblem(
  path: string,
  primary: string,
  additional: readonly WorkspaceSourceFolder[],
): string | undefined {
  if (!path.trim()) return undefined;
  if (samePath(path, primary)) return 'This is the primary folder.';
  if (additional.some((folder) => samePath(folder.path, path))) return 'Already allowed.';
  return undefined;
}
