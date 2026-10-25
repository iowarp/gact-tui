import type { PendingInteraction } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';
import { TechnicalDetails } from './technical-details';
import { permissionOperationLabel } from './permission-operation-labels';

/** Show the human decision before the optional protocol payload. */
export function PermissionOperationDetails({ interaction }: { interaction: PendingInteraction }) {
  const access = interaction.payload?.access;
  const call = interaction.payload?.tool_call;
  const input =
    call?.input && typeof call.input === 'object' ? (call.input as Record<string, unknown>) : {};
  const name = access?.operation ?? call?.tool_name ?? interaction.source.tool_name ?? '';
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '');
  const command = access?.command || text('command');
  const path = text('filepath') || text('path') || text('output_path');
  const cwd = access?.cwd || interaction.payload?.execution?.cwd || text('cwd');
  const isWebRequest = name === 'web_fetch' || name === 'web_search';
  const isSourceConnection = name === 'connected_data_connect';
  const sourceAccess: Record<string, string> = {
    read_only: 'Read only',
    working_copy: 'Editable copy, publish changes after review',
    write_enabled: 'Read and write originals',
  };
  const resources = Array.isArray(input.resources)
    ? input.resources.filter((value): value is string => typeof value === 'string')
    : [];
  const facts = [
    [
      'Why',
      access?.reason ||
        text('reason') ||
        text('access_reason') ||
        text('_clio_task_description') ||
        (interaction.prompt !== interaction.title ? interaction.prompt : ''),
    ],
    ['Action', permissionOperationLabel(name, input) ?? name],
    ...(name === 'web_fetch' ? [['Source', text('target') || text('url')]] : []),
    ...(name === 'web_search' ? [['Query', text('query')]] : []),
    ...(isSourceConnection
      ? [
          ['Source', text('label')],
          ['Provider', text('provider') === 'ndp' ? 'National Data Platform' : text('provider')],
          ['Endpoint', text('endpoint')],
          ['Access', sourceAccess[text('mode')] ?? text('mode')],
          ['Resources', resources.join(', ')],
        ]
      : []),
    ['Computer', access?.computer || interaction.payload?.execution?.computer],
    ['Working folder', isWebRequest ? '' : cwd],
    [
      'Output folder',
      name === 'web_fetch' && input.to_file === true ? text('output_dir') || cwd : '',
    ],
    ['File', path],
  ].filter(([, value]) => value);
  return (
    <div className="space-y-3 text-sm font-normal" data-slot="permission-operation-details">
      {facts.length ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          {facts.map(([label, value]) => (
            <div className="contents" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {access ? (
        <div>
          <p className="mb-1 text-muted-foreground">Read and write access</p>
          <ul className="space-y-1">
            {access.folders.map((folder) => (
              <li className="break-all font-mono text-xs" key={folder}>
                {folder}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {vocab.agent} can read and change files here, including after restart, until you remove
            these workspace folders. Conversations sharing the primary folder share this access.
          </p>
        </div>
      ) : null}
      {access?.paths.length ? (
        <TechnicalDetails title="Files involved">
          <ul className="space-y-1 text-xs">
            {access.paths.map((path) => (
              <li className="break-all font-mono" key={path}>
                {path}
              </li>
            ))}
          </ul>
        </TechnicalDetails>
      ) : null}
      {command ? (
        <pre
          aria-label="Command to run"
          className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-3 font-mono text-xs"
        >
          {command}
        </pre>
      ) : null}
    </div>
  );
}
