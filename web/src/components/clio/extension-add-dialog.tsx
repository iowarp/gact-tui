import type { LocalExtensionInput, McpConfigurationInput } from '@clio/core/v3';
import { useRef, useState } from 'react';
import { PlusIcon, PackageIcon, BoxesIcon, CableIcon } from 'lucide-react';
import { CapabilitySelection } from './capability-picker';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { EnvironmentTable } from './environment-table';
import { environmentNameProblem, isEnvironmentComment } from '@/lib/environment-names';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { usePluginCatalog, useExtensionsSupported } from '@/hooks/use-session-agent';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SavedMcpService } from '@clio/core/v3';

export type ExtensionAdd = {
  kind: 'remote' | 'local' | 'import' | 'skill' | 'plugin' | 'upload';
  source?: string;
  url?: string;
  title?: string;
  command?: string;
  args?: string[];
  category?: 'marketplaces' | 'mcp' | 'skills' | 'plugins';
};

const CHOICES: ExtensionAdd['kind'][] = ['remote', 'local', 'import', 'upload', 'skill', 'plugin'];
const ADD_LABELS = {
  remote: 'MCP server URL',
  local: 'Local MCP command',
  import: 'Repository or host folder',
  upload: 'Upload ZIP',
  skill: 'Create a skill',
  plugin: 'Compose a plugin',
};

/** The same add menu in the extension library and infrastructure services. */
export function ExtensionAddMenu({
  onChoose,
  mcpOnly = false,
  category,
}: {
  onChoose: (choice: ExtensionAdd) => void;
  mcpOnly?: boolean;
  category?: ExtensionAdd['category'];
}) {
  const supported = useExtensionsSupported();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={mcpOnly ? 'sm' : 'default'}
          disabled={supported !== true}
          title={
            supported === false
              ? 'Update the connected agent service to use the extension library'
              : undefined
          }
        >
          <PlusIcon />
          {mcpOnly || category === 'mcp'
            ? 'Add MCP'
            : category === 'skills'
              ? 'Add skill'
              : category === 'plugins'
                ? 'Add plugin'
                : 'Add'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {CHOICES.filter((kind) => {
          if (mcpOnly || category === 'mcp') return kind === 'remote' || kind === 'local';
          if (category === 'skills')
            return kind === 'skill' || kind === 'import' || kind === 'upload';
          if (category === 'plugins')
            return kind === 'plugin' || kind === 'import' || kind === 'upload';
          return true;
        }).map((kind) => (
          <DropdownMenuItem key={kind} onSelect={() => onChoose({ kind, category })}>
            {kind === 'upload' && category
              ? `Upload ${category === 'skills' ? 'skill' : 'plugin'} ZIP`
              : ADD_LABELS[kind]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
const TITLES = {
  remote: 'Add an MCP connection',
  local: 'Add a local MCP',
  import: 'Add from a repository or folder',
  skill: 'Create a skill',
  plugin: 'Compose a plugin',
  upload: 'Upload a skill or plugin',
};
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

/** One add surface; advanced transport details stay behind disclosure. */
export function ExtensionAddDialog({
  choice,
  connections,
  onClose,
  onSaved,
  onSignIn,
}: {
  choice: ExtensionAdd;
  connections: SavedMcpService[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onSignIn: (name: string) => void;
}) {
  const repository = useRepository();
  const supported = useExtensionsSupported();

  const [name, setName] = useState(choice.title ?? '');
  const [source, setSource] = useState(choice.source ?? '');
  const [url, setUrl] = useState(choice.url ?? '');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [command, setCommand] = useState(choice.command || 'uvx');
  const [args, setArgs] = useState(choice.args ? JSON.stringify(choice.args) : '');
  const [environment, setEnvironment] = useState('');
  const [everyConversation, setEveryConversation] = useState(false);
  const [headers, setHeaders] = useState('');
  const [auth, setAuth] = useState<'auto' | 'none' | 'oauth'>('auto');
  const [transport, setTransport] = useState<'http' | 'sse'>(
    choice.url?.endsWith('/sse') ? 'sse' : 'http',
  );
  const [refs, setRefs] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [file, setFile] = useState<File>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      if (supported !== true)
        throw new Error('Update the connected agent service to use this extension setup');
      const rawKey = slug(name);
      const key =
        (choice.kind === 'remote' || choice.kind === 'local') && rawKey && !/^[a-z]/u.test(rawKey)
          ? `mcp-${rawKey}`
          : rawKey;
      if (!key && choice.kind !== 'import')
        throw new Error('Include a letter or number in the extension name');
      if (choice.kind === 'plugin' && !refs.length && !selected.length)
        throw new Error('Choose at least one skill, plugin or MCP connection');
      if (choice.kind === 'remote' || choice.kind === 'local') {
        if (connections.some((row) => row.name === key))
          throw new Error('That connection name already exists. Choose another name.');
        let input: McpConfigurationInput;
        if (choice.kind === 'remote') {
          const parsedHeaders: Record<string, string> = {};
          for (const line of headers.split('\n').filter((line) => line.trim())) {
            const colon = line.indexOf(':');
            if (colon < 1) throw new Error('Use one Header: value per line');
            parsedHeaders[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
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
          const argv: unknown = JSON.parse(args || '[]');
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
        if (result.status === 'auth_required' || auth === 'oauth') onSignIn(key);
        else if (result.status === 'ready')
          toast.success(`Connected ${name}`, {
            description: `${result.tools_count} ${result.tools_count === 1 ? 'tool' : 'tools'} available. Compose a plugin to add it to an agent.`,
          });
        else toast.warning('Connection saved; check failed', { description: result.error });
      } else {
        if (choice.kind === 'import')
          await repository.installPluginMarketplace({
            source: source.trim(),
            name: key || undefined,
          });
        else if (choice.kind === 'upload') {
          if (!file) throw new Error('Choose a ZIP file');
          if (file.size > 2 * 1024 * 1024)
            throw new Error('Use a ZIP smaller than 2 MiB, or add its repository');
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          await repository.uploadExtension(
            key,
            btoa(binary),
            choice.category === 'skills'
              ? 'skill'
              : choice.category === 'plugins'
                ? 'plugin'
                : undefined,
          );
        } else {
          const body: LocalExtensionInput = {
            name: key,
            description,
            requires: refs,
            connections: Object.fromEntries(selected.map((value) => [value, value])),
          };
          if (choice.kind === 'skill')
            body.skill = `---\nname: ${key}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\n${instructions}\n`;
          await repository.createLocalExtension(body);
        }
        await onSaved();
        onClose();
        toast.success(
          choice.kind === 'import' ? 'Source installed' : 'Saved to Private local marketplace',
          {
            description:
              'Inspect the contents, then trust the source to make it available to agents.',
          },
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add extension');
    } finally {
      setBusy(false);
    }
  }
  const remote = choice.kind === 'remote';
  const importing = choice.kind === 'import';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {choice.kind === 'upload' && choice.category
              ? `Upload a ${choice.category === 'skills' ? 'skill' : 'plugin'}`
              : TITLES[choice.kind]}
          </DialogTitle>
          <DialogDescription>
            {remote
              ? 'Enter the address from your MCP server. Sign-in opens in your browser when required.'
              : importing
                ? 'Install a marketplace, plugin or Agent Skills folder. The original source stays unchanged.'
                : choice.kind === 'plugin'
                  ? 'Combine installed capabilities and saved connections. Credentials stay with their connection.'
                  : choice.kind === 'upload'
                    ? `Upload a ${choice.category === 'skills' ? 'skill' : 'plugin'} ZIP to your private marketplace.`
                    : choice.kind === 'skill'
                      ? 'Save reusable instructions in your private marketplace.'
                      : 'Run an MCP server on the connected agent host.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Label className="grid gap-2">
            {importing ? 'Local name (optional)' : 'Name'}
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                remote
                  ? 'Home Assistant'
                  : choice.kind === 'skill' || choice.category === 'skills'
                    ? 'My skill'
                    : choice.kind === 'plugin' || choice.category === 'plugins'
                      ? 'My plugin'
                      : 'My connection'
              }
              required={!importing}
            />
          </Label>
          {remote ? (
            <>
              <Label className="grid gap-2">
                MCP server URL
                <Input
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://your-server.example/mcp"
                  required
                />
              </Label>
              <details className="text-sm">
                <summary className="cursor-pointer">Advanced connection settings</summary>
                <div className="grid gap-3 pt-3">
                  <Label className="grid gap-2">
                    Authentication
                    <select
                      aria-label="Authentication"
                      className="h-9 rounded-md border bg-background px-2"
                      value={auth}
                      onChange={(event) => setAuth(event.target.value as typeof auth)}
                    >
                      <option value="auto">Detect when connecting</option>
                      <option value="oauth">Sign in with OAuth</option>
                      <option value="none">No OAuth · open access or request headers</option>
                    </select>
                  </Label>
                  <Label className="grid gap-2">
                    Transport
                    <select
                      aria-label="Transport"
                      className="h-9 rounded-md border bg-background px-2"
                      value={transport}
                      onChange={(event) => setTransport(event.target.value as typeof transport)}
                    >
                      <option value="http">Streamable HTTP</option>
                      <option value="sse">SSE (legacy)</option>
                    </select>
                  </Label>
                  <Label className="grid gap-2">
                    Request headers
                    <Textarea
                      value={headers}
                      onChange={(event) => setHeaders(event.target.value)}
                      placeholder="Authorization: Bearer …"
                      autoComplete="off"
                    />
                  </Label>
                  <p className="text-muted-foreground">
                    Header values are saved privately on the agent host and hidden after saving.
                  </p>
                </div>
              </details>
            </>
          ) : null}
          {importing ? (
            <Label className="grid gap-2">
              Repository URL or folder on the agent host
              <Input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="https://github.com/homeassistant-ai/skills"
                required
              />
            </Label>
          ) : null}
          {choice.kind === 'upload' ? (
            <div className="grid gap-2">
              <Input
                ref={fileInput}
                className="sr-only"
                aria-label={choice.category === 'skills' ? 'Skill ZIP' : 'Plugin ZIP'}
                type="file"
                accept=".zip"
                onChange={(event) => setFile(event.target.files?.[0])}
              />
              <button
                type="button"
                className={`rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${dragging ? 'border-primary bg-accent' : 'hover:bg-muted/40'}`}
                onClick={() => fileInput.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const dropped = event.dataTransfer.files;
                  if (dropped.length !== 1) setError('Drop one ZIP file');
                  else {
                    setFile(dropped[0]);
                    setError('');
                  }
                }}
              >
                {file
                  ? file.name
                  : `Drop a ${choice.category === 'skills' ? 'skill' : 'plugin'} ZIP here, or click to choose`}
              </button>
              <span className="text-sm text-muted-foreground">
                {choice.category === 'skills'
                  ? 'A skill folder containing SKILL.md and its references.'
                  : 'A plugin folder containing plugin.json or .claude-plugin/plugin.json.'}{' '}
                Up to 128 UTF-8 files, 2 MiB uncompressed.
              </span>
            </div>
          ) : null}
          {choice.kind === 'local' ? (
            <>
              <Label className="grid gap-2">
                Command
                <Input
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  required
                />
              </Label>
              <Label className="grid gap-2">
                Arguments
                <Textarea
                  value={args}
                  onChange={(event) => setArgs(event.target.value)}
                  placeholder={'["ha-mcp"]'}
                />
              </Label>
              <details className="text-sm">
                <summary className="cursor-pointer">Environment variables</summary>
                <div className="pt-3">
                  <EnvironmentTable
                    id="mcp-process-settings"
                    value={environment}
                    onChange={setEnvironment}
                  />
                </div>
              </details>
              <p className="text-sm text-muted-foreground">
                Runs on the connected agent host. The command starts when you add this connection.
              </p>
            </>
          ) : null}
          {remote || choice.kind === 'local' ? (
            <details className="text-sm">
              <summary className="cursor-pointer">Conversation access</summary>
              <label className="mt-3 flex items-start gap-2">
                <Checkbox
                  checked={everyConversation}
                  onCheckedChange={(value) => setEveryConversation(value === true)}
                />
                <span>
                  Available in every conversation
                  <span className="block text-muted-foreground">
                    Otherwise, include this connection in a plugin and add it to selected agents.
                  </span>
                </span>
              </label>
            </details>
          ) : null}
          {choice.kind === 'skill' || choice.kind === 'plugin' ? (
            <Label className="grid gap-2">
              Description
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </Label>
          ) : null}
          {choice.kind === 'skill' ? (
            <Label className="grid gap-2">
              Instructions
              <Textarea
                className="min-h-52"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="When to use this skill, what to do, and how to verify the outcome."
                required
              />
            </Label>
          ) : null}
          {choice.kind === 'plugin' ? (
            <>
              <PluginChoices values={refs} onChange={setRefs} />
              <ConnectionChoices
                connections={connections}
                values={selected}
                onChange={setSelected}
              />
            </>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {!remote && choice.kind !== 'local' && !importing ? (
            <p className="text-sm text-muted-foreground">
              Saves to your Private local marketplace on this agent host. GitHub backup is available
              from Marketplaces.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || supported !== true}>
              {busy
                ? 'Adding…'
                : remote || choice.kind === 'local'
                  ? 'Connect'
                  : importing
                    ? 'Install source'
                    : 'Save to private marketplace'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PluginChoices({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const catalog = usePluginCatalog();
  const items = (catalog.data?.plugins ?? [])
    .filter((row) => row.id !== 'core' && !row.pending_trust)
    .map((row) => ({
      id: row.ref,
      title: row.id,
      source: row.marketplace,
      description: row.description,
      keywords: [...row.skills, ...row.members, ...row.mcp_servers],
      group: row.kind === 'pack' ? 'Packs' : 'Plugins',
      state: row.trusted ? '' : 'Not trusted yet',
      icon:
        row.kind === 'pack' ? <BoxesIcon className="size-4" /> : <PackageIcon className="size-4" />,
    }));
  return (
    <CapabilitySelection
      label="Skills & plugins"
      items={items}
      values={values}
      onChange={onChange}
      pending={catalog.isPending}
      error={catalog.error?.message}
    />
  );
}
function ConnectionChoices({
  connections,
  values,
  onChange,
}: {
  connections: SavedMcpService[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const items = connections.map((row) => ({
    id: row.name,
    title: row.label || row.name,
    source: row.transport === 'stdio' ? 'Local command' : 'Remote MCP',
    keywords: [row.name],
    group: 'Saved connections',
    icon: <CableIcon className="size-4" />,
  }));
  return (
    <CapabilitySelection
      label="Saved MCP connections"
      items={items}
      values={values}
      onChange={onChange}
    />
  );
}
