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
import { AskCode, AskFacts, AskSection, type AskFact } from './ask-card';
import { TechnicalDetails } from './technical-details';
import { permissionCommand, permissionOperationLabel } from './permission-operation-labels';

const SOURCE_ACCESS: Record<string, string> = {
  read_only: 'Read only',
  working_copy: 'Editable copy, publish changes after review',
  write_enabled: 'Read and write originals',
};

export interface PermissionOperation {
  facts: AskFact[];
  command: string;
  folders: readonly string[];
  paths: readonly string[];
}

function Place({
  icon,
  mono,
  fixed,
  children,
}: {
  icon?: ReactNode;
  mono?: boolean;
  /** Keeps its width beside a long sibling; it truncates only past 40% of the row. */
  fixed?: boolean;
  children: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        fixed && 'max-w-[40%] shrink-0',
      )}
      title={children}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0 text-muted-foreground [&_svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      <span className={cn('min-w-0 truncate', mono && 'font-mono text-[12px]')}>{children}</span>
    </span>
  );
}

/**
 * The decision in plain facts: why, what, where it runs. `title` drops the
 * Action row when the card title already says it.
 */
function permissionOperation(
  interaction: PendingInteraction,
  { title }: { title?: string } = {},
): PermissionOperation {
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
    ...(name === 'web_fetch' ? fact('Source', <GlobeIcon />, text('target') || text('url')) : []),
    ...(name === 'web_search' ? fact('Query', <SearchIcon />, text('query')) : []),
    ...(name === 'browser_host'
      ? [
          ...fact('Site', <GlobeIcon />, text('host')),
          ...fact('Page', <FileIcon />, text('label')),
          ...fact('Address', <LinkIcon />, text('url')),
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
          ...fact('Endpoint', <PlugIcon />, text('endpoint')),
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
                  <Place fixed icon={<ServerIcon />}>
                    {computer}
                  </Place>
                ) : null}
                {folder ? (
                  <Place icon={<FolderIcon />} mono>
                    {folder}
                  </Place>
                ) : null}
              </>
            ),
            // The label is the server icon when narrow; the computer does not repeat it.
            narrow:
              computer && folder ? (
                <>
                  <Place fixed>{computer}</Place>
                  <Place icon={<FolderIcon />} mono>
                    {folder}
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
    ...fact('File', <FileIcon />, path, true),
    ...(access?.folders.length
      ? [
          {
            label: access.folders.length > 1 ? 'Folders' : 'Folder',
            icon: <FolderIcon />,
            title: access.folders.join('\n'),
            value: (
              <>
                {access.folders.map((entry) => (
                  <span className="min-w-0 truncate font-mono text-[12px]" key={entry}>
                    {entry}
                  </span>
                ))}
              </>
            ),
            narrow:
              access.folders.length > 1 ? (
                <span className="min-w-0 truncate">writes to {access.folders.length} folders</span>
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
      <ul className="grid gap-0.5 font-mono text-[11px] text-foreground/85">
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
  const { facts, command, folders, paths } = permissionOperation(interaction, { title });
  return (
    <div className="contents" data-slot="permission-operation-details">
      <AskFacts facts={[...facts, ...extraFacts]} />
      {folders.length ? (
        // Nothing wraps at a fifth of the window; hover keeps the whole sentence.
        <AskSection
          className="mt-1 text-[11.5px] text-muted-foreground @max-[420px]/ask:truncate"
          title={`${vocab.agent} can change files here, including after restart, until you remove these folders. Conversations on the primary folder share this access.`}
        >
          {vocab.agent} can change files here, including after restart, until you remove these
          folders. Conversations on the primary folder share this access.
        </AskSection>
      ) : null}
      {showCommand && command ? <AskCode code={command} label="Command to run" /> : null}
      {pathsInline && paths.length ? (
        <AskSection>
          <TechnicalDetails className="text-[11.5px] text-muted-foreground" title="Files involved">
            <PermissionPaths paths={paths} />
          </TechnicalDetails>
        </AskSection>
      ) : null}
    </div>
  );
}
