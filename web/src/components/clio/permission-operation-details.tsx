import type { PendingInteraction } from '@clio/core/v3';
import {
  DatabaseIcon,
  FileIcon,
  FilesIcon,
  FolderIcon,
  FolderOutputIcon,
  GlobeIcon,
  KeyRoundIcon,
  LinkIcon,
  PlugIcon,
  SearchIcon,
  ServerIcon,
  ZapIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { vocab } from '@/lib/brand-vocabulary';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { workspaceFilePath } from '@/lib/workspace-file-path';
import { useLiveStore } from '@/store/live-store';
import { AskCode, AskFacts, AskSection, type AskFact } from './ask-card';
import { TechnicalDetails } from './technical-details';
import { permissionCommand, permissionOperationLabel } from './permission-operation-labels';

const SOURCE_ACCESS: Record<string, string> = {
  read_only: 'Read only',
  working_copy: 'Editable copy, publish changes after review',
  write_enabled: 'Read and write originals',
};

const ACCESS_NOTE = `${vocab.agent} can change files here, including after restart, until you remove these folders. Conversations on the primary folder share this access.`;

export interface PermissionOperation {
  facts: AskFact[];
  command: string;
  folders: readonly string[];
  paths: readonly string[];
}

interface WorkspacePlace {
  name?: string;
  root?: string;
}

/**
 * A location as the person knows it: inside the workspace it starts at the
 * workspace's name ("opal-sites/data/run.csv"); elsewhere it stays whole.
 */
function workspacePlace(path: string, workspace?: WorkspacePlace): string {
  const root = workspace?.root;
  if (!root) return path;
  const trimmed = (value: string) => value.replace(/\\/gu, '/').replace(/\/+$/u, '');
  const name = workspace.name || trimmed(root).split('/').pop() || root;
  if (trimmed(path).toLocaleLowerCase() === trimmed(root).toLocaleLowerCase()) return name;
  const relative = workspaceFilePath(path, root);
  return relative === path.replace(/\\/gu, '/') ? path : `${name}/${relative}`;
}

function Place({
  icon,
  mono,
  fixed,
  title,
  children,
}: {
  icon?: ReactNode;
  mono?: boolean;
  /** Keeps its width beside a long sibling; it truncates only past 40% of the row. */
  fixed?: boolean;
  /** The full location when the text is a compacted one. */
  title?: string;
  children: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        fixed && 'max-w-[40%] shrink-0',
      )}
      title={title ?? children}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0 text-muted-foreground [&_svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      <span className={cn('min-w-0 truncate', mono && 'font-mono text-meta')}>{children}</span>
    </span>
  );
}

/**
 * The decision in plain facts: why, what, where it runs. `title` drops the
 * Action row when the card title already says it.
 */
function permissionOperation(
  interaction: PendingInteraction,
  { title, workspace }: { title?: string; workspace?: WorkspacePlace } = {},
): PermissionOperation {
  const place = (value: string) => workspacePlace(value, workspace);
  const access = interaction.payload?.access;
  const call = interaction.payload?.tool_call;
  const input =
    call?.input && typeof call.input === 'object' ? (call.input as Record<string, unknown>) : {};
  const name = access?.operation ?? call?.tool_name ?? interaction.source.tool_name ?? '';
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '');
  const { command, computer } = permissionCommand(interaction);
  const path = text('path') || text('output_path');
  const cwd = access?.cwd || interaction.payload?.execution?.cwd || text('cwd');
  const isWebRequest = name === 'web_fetch' || name === 'web_search' || name === 'browser_host';
  const isSourceConnection = name === 'connected_data_connect';
  const resources = Array.isArray(input.resources)
    ? input.resources.filter((value): value is string => typeof value === 'string')
    : [];
  const action = permissionOperationLabel(name, input) ?? name;
  const folder = isWebRequest ? '' : cwd;
  const fact = (label: string, icon: ReactNode, value: string, mono = false): AskFact[] =>
    value ? [{ label, icon, value, mono }] : [];
  const facts: AskFact[] = [
    ...fact(
      'Why',
      <InfoIcon />,
      access?.reason ||
        text('reason') ||
        text('access_reason') ||
        text('_clio_task_description') ||
        (interaction.prompt && interaction.prompt !== interaction.title ? interaction.prompt : ''),
    ),
    // A raw tool id is already the header's mono name; only a plain label adds a row.
    ...(action && action !== title && action !== (call?.tool_name ?? interaction.source.tool_name)
      ? fact('Action', <ZapIcon />, action)
      : []),
    ...(name === 'web_fetch'
      ? fact('Source', <GlobeIcon />, text('target') || text('url'), true)
      : []),
    ...(name === 'web_search' ? fact('Query', <SearchIcon />, text('query')) : []),
    ...(name === 'browser_host'
      ? [
          ...fact('Site', <GlobeIcon />, text('host'), true),
          ...fact('Page', <FileIcon />, text('label')),
          ...fact('Address', <LinkIcon />, text('url'), true),
        ]
      : []),
    ...(isSourceConnection
      ? [
          ...fact('Source', <DatabaseIcon />, text('label')),
          ...fact(
            'Provider',
            <DatabaseIcon />,
            text('provider') === 'ndp' ? 'National Data Platform' : text('provider'),
          ),
          ...fact('Endpoint', <PlugIcon />, text('endpoint'), true),
          ...fact('Access', <KeyRoundIcon />, SOURCE_ACCESS[text('mode')] ?? text('mode')),
          ...fact('Resources', <FilesIcon />, resources.join(', ')),
        ]
      : []),
    ...(computer || folder
      ? [
          {
            label: 'Runs on',
            icon: <ServerIcon />,
            title: [computer, folder].filter(Boolean).join(', '),
            value: (
              <>
                {computer ? (
                  <Place fixed icon={<ServerIcon />} mono>
                    {computer}
                  </Place>
                ) : null}
                {folder ? (
                  <Place icon={<FolderIcon />} mono title={folder}>
                    {place(folder)}
                  </Place>
                ) : null}
              </>
            ),
            // The label is the server icon when narrow; the computer does not repeat it.
            narrow:
              computer && folder ? (
                <>
                  <Place fixed mono>
                    {computer}
                  </Place>
                  <Place icon={<FolderIcon />} mono title={folder}>
                    {place(folder)}
                  </Place>
                </>
              ) : undefined,
          },
        ]
      : []),
    ...fact(
      'Output folder',
      <FolderOutputIcon />,
      name === 'web_fetch' && input.to_file === true ? text('output_dir') || cwd : '',
    ),
    ...(path
      ? [{ label: 'File', icon: <FileIcon />, value: place(path), title: path, mono: true }]
      : []),
    ...(access?.folders.length
      ? [
          {
            label: access.folders.length > 1 ? 'Folders' : 'Folder',
            icon: <FolderIcon />,
            title: `${access.folders.join('\n')}\n${ACCESS_NOTE}`,
            // The lasting-access note sits under the folders it is about. It is consent text,
            // so it wraps to as many lines as it needs and is never cut.
            wrap: true,
            value: (
              <span className="grid w-full min-w-0">
                <span className="flex min-w-0 gap-[7px]">
                  {access.folders.map((entry) => (
                    <span className="min-w-0 truncate font-mono text-meta" key={entry}>
                      {entry}
                    </span>
                  ))}
                </span>
                <span className="text-label leading-4 whitespace-normal text-muted-foreground">
                  {ACCESS_NOTE}
                </span>
              </span>
            ),
            narrow:
              access.folders.length > 1 ? (
                <span className="grid w-full min-w-0">
                  <span className="min-w-0 truncate">
                    writes to {access.folders.length} folders
                  </span>
                  {/* Consent text: never cut, at any width. */}
                  <span className="text-label leading-4 whitespace-normal text-muted-foreground">
                    {ACCESS_NOTE}
                  </span>
                </span>
              ) : undefined,
          },
        ]
      : []),
  ];
  return { facts, command, folders: access?.folders ?? [], paths: access?.paths ?? [] };
}

/** The files a folder grant touches, for Technical details. */
export function PermissionPaths({ paths }: { paths: readonly string[] }) {
  if (!paths.length) return null;
  return (
    <div className="grid gap-0.5" data-slot="permission-paths">
      <p className="text-muted-foreground">Files involved</p>
      <ul className="grid gap-0.5 font-mono text-caption text-foreground/85">
        {paths.map((entry) => (
          <li className="break-all" key={entry}>
            {entry}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Show the human decision before the optional protocol payload. */
export function PermissionOperationDetails({
  interaction,
  title,
  extraFacts = [],
  pathsInline = true,
  showCommand = true,
}: {
  interaction: PendingInteraction;
  title?: string;
  /** Rows the card adds after these facts (Asked by). */
  extraFacts?: readonly AskFact[];
  /** Standalone use lists the files here; the card moves them into Technical details. */
  pathsInline?: boolean;
  /** Off when the card shows the whole script instead of the command that runs it. */
  showCommand?: boolean;
}) {
  const workspaceId = useLiveStore(
    (state) =>
      interaction.payload?.access?.workspace_id ??
      state.entities.sessions[interaction.owner_session_id]?.workspace_id,
  );
  const root = useLiveStore((state) =>
    workspaceId ? state.entities.workspaces[workspaceId]?.path : undefined,
  );
  const name = useLiveStore((state) => {
    const entry = workspaceId ? state.entities.workspaces[workspaceId] : undefined;
    return entry?.display_name || entry?.name;
  });
  const { facts, command, paths } = permissionOperation(interaction, {
    title,
    workspace: { name, root },
  });
  return (
    <div className="contents" data-slot="permission-operation-details">
      <AskFacts facts={[...facts, ...extraFacts]} />
      {showCommand && command ? <AskCode code={command} label="Command to run" /> : null}
      {pathsInline && paths.length ? (
        <AskSection>
          <TechnicalDetails className="text-label text-muted-foreground" title="Files involved">
            <PermissionPaths paths={paths} />
          </TechnicalDetails>
        </AskSection>
      ) : null}
    </div>
  );
}
