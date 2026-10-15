import type { PendingInteraction } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';
import { TechnicalDetails } from './technical-details';

const OPERATIONS: Record<string, string> = {
  fs_read_file: 'Read file',
  fs_propose_edit: 'Prepare a file edit for review',
  fs_apply_edit_write: 'Write file',
  shell_bash: 'Run command',
};

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
  const facts = [
    ['Why', access?.reason || text('reason') || text('access_reason')],
    ['Action', OPERATIONS[name] ?? name],
    ['Computer', access?.computer || interaction.payload?.execution?.computer],
    ['Working folder', cwd],
    ['File', path],
  ].filter(([, value]) => value);
  return (
    <div className="mt-3 space-y-3 text-sm font-normal" data-slot="permission-operation-details">
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
        <div className="border-t pt-3">
          <p className="mb-2 font-medium">Folders {vocab.agent} will be able to read and change</p>
          <ul className="space-y-1">
            {access.folders.map((folder) => (
              <li className="break-all font-mono text-xs" key={folder}>
                {folder}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted-foreground">
            Allowed for this workspace, including after restart, until removed in workspace folders.
            Conversations sharing its primary folder share this access.
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
