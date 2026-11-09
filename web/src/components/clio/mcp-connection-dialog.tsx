import type { McpConfigurationInput, SavedMcpService } from '@clio/core/v3';
import {
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  PlugIcon,
  TerminalIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { useExtensionsSupported } from '@/hooks/use-session-agent';
import { environmentNameProblem, isEnvironmentComment } from '@/lib/environment-names';
import { AddIcon, RemoveIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { EnvironmentTable } from './environment-table';
import { SettingsSelectField } from './model-select-field';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton } from './primitives/icon-button';
import { SegmentedControl } from './primitives/segmented-control';
import { SettingsRow } from './settings-row';

export type McpConnectionKind = 'remote' | 'local';

const AUTHENTICATION = {
  auto: 'Detect when connecting',
  oauth: 'Sign in with OAuth',
  none: 'No OAuth (open access or request headers)',
} as const;
type Authentication = keyof typeof AUTHENTICATION;

const FIELD = 'h-[1.875rem] text-[0.78125rem]';

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

function processEnvironment(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    if (!raw.trim() || isEnvironmentComment(raw)) continue;
    const split = raw.indexOf('=');
    const name = raw.slice(0, split).trim();
    if (split < 1 || environmentNameProblem(name))
      throw new Error('Use valid NAME=value process settings');
    result[name] = raw.slice(split + 1).trim();
  }
  return result;
}

interface HeaderRow {
  id: number;
  name: string;
  value: string;
  shown: boolean;
}

/**
 * Add an MCP connection: a URL or a command, named, with transport details
 * behind Advanced. Saving checks the connection; a service that needs sign-in
 * continues in the sign-in window.
 */
export function McpConnectionDialog({
  kind: initialKind,
  initial,
  connections,
  onClose,
  onSaved,
  onSignIn,
}: {
  kind: McpConnectionKind;
  initial?: { title?: string; url?: string; command?: string; args?: string[] };
  connections: SavedMcpService[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onSignIn: (name: string) => void;
}) {
  const repository = useRepository();
  const supported = useExtensionsSupported();
  const ids = useId();
  const [kind, setKind] = useState<McpConnectionKind>(initialKind);
  const [name, setName] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [command, setCommand] = useState(initial?.command || 'uvx');
  const [args, setArgs] = useState(initial?.args ? JSON.stringify(initial.args) : '');
  const [environment, setEnvironment] = useState('');
  const [everyConversation, setEveryConversation] = useState(false);
  const [headers, setHeaders] = useState<HeaderRow[]>([]);
  const [nextHeader, setNextHeader] = useState(1);
  const [auth, setAuth] = useState<Authentication>('auto');
  const [transport, setTransport] = useState<'http' | 'sse'>(
    initial?.url?.endsWith('/sse') ? 'sse' : 'http',
  );
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remote = kind === 'remote';

  const updateHeader = (id: number, change: Partial<HeaderRow>) =>
    setHeaders((rows) => rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
  const addHeader = () => {
    setHeaders((rows) => [...rows, { id: nextHeader, name: '', value: '', shown: false }]);
    setNextHeader((id) => id + 1);
  };

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (supported !== true)
        throw new Error('Update the connected agent service to use this extension setup');
      const rawKey = slug(name);
      const key = rawKey && !/^[a-z]/u.test(rawKey) ? `mcp-${rawKey}` : rawKey;
      if (!key) throw new Error('Include a letter or number in the connection name');
      if (connections.some((row) => row.name === key))
        throw new Error('That connection name already exists. Choose another name.');
      let input: McpConfigurationInput;
      if (remote) {
        if (!url.trim()) throw new Error('Enter the MCP server URL');
        const parsedHeaders: Record<string, string> = {};
        for (const row of headers) {
          if (!row.name.trim() && !row.value.trim()) continue;
          if (!row.name.trim()) throw new Error('Name every request header');
          parsedHeaders[row.name.trim()] = row.value.trim();
        }
        input = {
          transport,
          url: url.trim(),
          name,
          authentication: auth,
          headers: parsedHeaders,
          always_load: everyConversation,
          connection_only: !everyConversation,
        };
      } else {
        if (!command.trim()) throw new Error('Enter the command that starts the server');
        let argv: unknown;
        try {
          argv = JSON.parse(args || '[]');
        } catch {
          argv = undefined;
        }
        if (!Array.isArray(argv) || !argv.every((arg) => typeof arg === 'string'))
          throw new Error('Arguments must be a JSON array of strings');
        const env = processEnvironment(environment);
        input = {
          transport: 'stdio',
          command: command.trim(),
          args: argv,
          env,
          name,
          always_load: everyConversation,
          connection_only: !everyConversation,
        };
      }
      const result = await repository.configureMcpServer(key, input);
      await onSaved();
      onClose();
      if (result.status === 'auth_required' || (remote && auth === 'oauth')) onSignIn(key);
      else if (result.status === 'ready')
        toast.success(`Connected ${name}`, {
          description: `${result.tools_count} ${result.tools_count === 1 ? 'tool' : 'tools'} available. Compose a plugin to add it to an agent.`,
        });
      else toast.warning('Connection saved; check failed', { description: result.error });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add the connection');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame
      className="w-[clamp(360px,44vw,720px)]"
      confirm={{
        label: busy ? 'Adding…' : 'Add',
        onConfirm: () => void save(),
        disabled: busy || supported !== true,
      }}
      icon={<PlugIcon />}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      open
      title="Add an MCP connection"
      titleActions={
        <SegmentedControl
          className="mr-1"
          label="Connection type"
          onValueChange={(value) => {
            setKind(value);
            setError('');
          }}
          options={[
            { value: 'remote', label: 'URL', icon: <GlobeIcon aria-hidden="true" /> },
            { value: 'local', label: 'Command', icon: <TerminalIcon aria-hidden="true" /> },
          ]}
          value={kind}
        />
      }
    >
      <div
        className="-mx-[18px] -mt-3 max-h-[min(62dvh,34rem)] overflow-y-auto px-[18px] pt-1"
        title={
          supported === false
            ? 'Update the connected agent service to add MCP connections'
            : undefined
        }
      >
        <SettingsRow htmlFor={`${ids}-name`} title="Name">
          <Input
            autoComplete="off"
            className={cn(FIELD, 'font-mono')}
            data-initial-focus=""
            id={`${ids}-name`}
            onChange={(event) => setName(event.target.value)}
            placeholder={remote ? 'home-assistant' : 'my-connection'}
            spellCheck={false}
            value={name}
          />
        </SettingsRow>
        {remote ? (
          <SettingsRow
            description="The address your MCP server publishes. Sign-in opens in your browser when the service asks for it."
            htmlFor={`${ids}-url`}
            title="MCP server URL"
          >
            <Input
              autoComplete="off"
              className={cn(FIELD, 'font-mono')}
              id={`${ids}-url`}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://your-server.example/mcp"
              spellCheck={false}
              type="url"
              value={url}
            />
          </SettingsRow>
        ) : (
          <>
            <SettingsRow
              description="Runs on the connected agent host. The command starts when you add this connection."
              htmlFor={`${ids}-command`}
              title="Command"
            >
              <Input
                autoComplete="off"
                className={cn(FIELD, 'font-mono')}
                id={`${ids}-command`}
                onChange={(event) => setCommand(event.target.value)}
                spellCheck={false}
                value={command}
              />
            </SettingsRow>
            <SettingsRow
              description="A JSON array of strings, passed to the command as they are."
              htmlFor={`${ids}-args`}
              title="Arguments"
            >
              <Textarea
                className="min-h-[1.875rem] py-1 font-mono text-[0.78125rem]"
                id={`${ids}-args`}
                onChange={(event) => setArgs(event.target.value)}
                placeholder={'["ha-mcp"]'}
                rows={1}
                spellCheck={false}
                value={args}
              />
            </SettingsRow>
          </>
        )}
        <button
          aria-controls={`${ids}-advanced`}
          aria-expanded={advanced}
          className="mt-3 mb-1 flex h-7 items-center gap-1 rounded-sm text-[0.71875rem] text-faint outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => setAdvanced((open) => !open)}
          type="button"
        >
          Advanced
          <ChevronDownIcon
            aria-hidden="true"
            className={cn('size-3.5 motion-safe:transition-transform', advanced && 'rotate-180')}
          />
        </button>
        {advanced ? (
          <div id={`${ids}-advanced`}>
            {remote ? (
              <>
                <SettingsRow htmlFor={`${ids}-auth`} title="Authentication">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <SettingsSelectField
                        aria-label={`Authentication: ${AUTHENTICATION[auth]}`}
                        id={`${ids}-auth`}
                        value={AUTHENTICATION[auth]}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
                    >
                      <DropdownMenuRadioGroup
                        onValueChange={(value) => setAuth(value as Authentication)}
                        value={auth}
                      >
                        {(Object.keys(AUTHENTICATION) as Authentication[]).map((value) => (
                          <DropdownMenuRadioItem key={value} value={value}>
                            {AUTHENTICATION[value]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SettingsRow>
                <SettingsRow title="Transport">
                  <SegmentedControl
                    label="Transport"
                    onValueChange={setTransport}
                    options={[
                      { value: 'http', label: 'Streamable HTTP' },
                      { value: 'sse', label: 'SSE (legacy)' },
                    ]}
                    value={transport}
                  />
                </SettingsRow>
                <HeaderRows
                  onAdd={addHeader}
                  onChange={updateHeader}
                  onRemove={(id) => setHeaders((rows) => rows.filter((row) => row.id !== id))}
                  rows={headers}
                />
              </>
            ) : (
              <div className="grid gap-2 border-b border-border/70 py-2">
                <h3 className="text-[0.8125rem]">Environment variables</h3>
                <EnvironmentTable
                  id="mcp-process-settings"
                  onChange={setEnvironment}
                  value={environment}
                />
              </div>
            )}
            <SettingsRow
              description="Otherwise, include this connection in a plugin and add it to selected agents."
              htmlFor={`${ids}-every`}
              inlineControl
              title="Available in every conversation"
            >
              <Switch
                checked={everyConversation}
                id={`${ids}-every`}
                onCheckedChange={setEveryConversation}
              />
            </SettingsRow>
          </div>
        ) : null}
        {error ? (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </DialogFrame>
  );
}

function HeaderRows({
  rows,
  onAdd,
  onChange,
  onRemove,
}: {
  rows: HeaderRow[];
  onAdd: () => void;
  onChange: (id: number, change: Partial<HeaderRow>) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <SettingsRow
      description="Header values are saved privately on the agent host and hidden after saving."
      title="Request headers"
    >
      <div className="grid w-0 min-w-full gap-1.5">
        {rows.map((row, index) => (
          <div className="flex min-w-0 items-center gap-1.5" key={row.id}>
            <Input
              aria-label={`Header ${index + 1} name`}
              autoComplete="off"
              className={cn(FIELD, 'w-[48%] min-w-0 px-2 font-mono')}
              onChange={(event) => onChange(row.id, { name: event.target.value })}
              placeholder="Authorization"
              spellCheck={false}
              value={row.name}
            />
            <div className="relative min-w-0 flex-1">
              <Input
                aria-label={`Header ${index + 1} value`}
                autoComplete="new-password"
                className={cn(FIELD, 'pr-8 font-mono')}
                onChange={(event) => onChange(row.id, { value: event.target.value })}
                spellCheck={false}
                type={row.shown ? 'text' : 'password'}
                value={row.value}
              />
              <IconButton
                aria-pressed={row.shown}
                className="absolute top-1/2 right-0.5 -translate-y-1/2"
                icon={row.shown ? <EyeOffIcon /> : <EyeIcon />}
                label={
                  row.shown ? `Hide header ${index + 1} value` : `Show header ${index + 1} value`
                }
                onClick={() => onChange(row.id, { shown: !row.shown })}
                size="sm"
              />
            </div>
            <IconButton
              icon={<RemoveIcon />}
              label={`Remove header ${index + 1}`}
              onClick={() => onRemove(row.id)}
              size="sm"
            />
          </div>
        ))}
        <Button
          className="h-7 w-fit gap-1 px-1.5 text-[0.75rem] text-muted-foreground"
          onClick={onAdd}
          size="sm"
          type="button"
          variant="ghost"
        >
          <AddIcon aria-hidden="true" /> Add header
        </Button>
      </div>
    </SettingsRow>
  );
}
