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
import { t } from '@lingui/core/macro';

import { WORKSPACE_COLOURS as COLOURS } from '@/theme/workspace-colours';

// The palette lives in theme/, which the pre-paint boot script bundles without
// the translation runtime, so its names are translated here.
const COLOUR_LABELS: Record<(typeof COLOURS)[number]['id'], string> = {
  clay: t`Clay`,
  amber: t`Amber`,
  green: t`Green`,
  blue: t`Blue`,
  violet: t`Violet`,
};

export const WORKSPACE_COLOURS = COLOURS.map((colour) => ({
  ...colour,
  label: COLOUR_LABELS[colour.id],
}));

export const WORKSPACE_ICONS: ReadonlyArray<{ id: string; label: string; Icon: LucideIcon }> = [
  { id: 'folder', label: t`Folder`, Icon: FolderIcon },
  { id: 'flask', label: t`Lab`, Icon: FlaskConicalIcon },
  { id: 'microscope', label: t`Microscope`, Icon: MicroscopeIcon },
  { id: 'database', label: t`Data`, Icon: DatabaseIcon },
  { id: 'chart', label: t`Analysis`, Icon: ChartLineIcon },
  { id: 'globe', label: t`Earth`, Icon: GlobeIcon },
  { id: 'code', label: t`Code`, Icon: CodeIcon },
  { id: 'book', label: t`Notes`, Icon: BookOpenIcon },
];

export interface WorkspaceAppearance {
  colour: string;
  icon: string;
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/**
 * The colour and icon a workspace has until someone picks its own: derived from
 * its id, so it always looks the same and neighbours differ.
 */
export function defaultWorkspaceAppearance(workspaceId: string): WorkspaceAppearance {
  const value = hash(workspaceId);
  return {
    icon: WORKSPACE_ICONS[value % WORKSPACE_ICONS.length]!.id,
    colour:
      WORKSPACE_COLOURS[Math.floor(value / WORKSPACE_ICONS.length) % WORKSPACE_COLOURS.length]!.id,
  };
}

export const workspaceIcon = (id: string) =>
  WORKSPACE_ICONS.find((icon) => icon.id === id) ?? WORKSPACE_ICONS[0];

export const workspaceColour = (id: string) =>
  WORKSPACE_COLOURS.find((colour) => colour.id === id) ?? WORKSPACE_COLOURS[1];

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
  const fallback = defaultWorkspaceAppearance(workspaceId ?? '');
  const appearance: WorkspaceAppearance = {
    colour: stored?.colour ?? fallback.colour,
    icon: stored?.icon ?? fallback.icon,
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
    t`Workspace folder`
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
  if (samePath(path, primary)) return t`This is the primary folder.`;
  if (additional.some((folder) => samePath(folder.path, path))) return t`Already allowed.`;
  return undefined;
}
