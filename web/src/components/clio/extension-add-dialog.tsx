import type { LocalExtensionInput } from '@clio/core/v3';
import { useId, useRef, useState } from 'react';
import { PackageIcon, BoxesIcon, CableIcon } from 'lucide-react';
import { AddIcon } from '@/lib/icon-vocabulary';
import { CapabilitySelection } from './capability-picker';
import { toast } from 'sonner';
import { DialogFrame } from './primitives/dialog-frame';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { usePluginCatalog, useExtensionsSupported } from '@/hooks/use-session-agent';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { SplitButton } from './primitives/split-button';
import type { SavedMcpService } from '@clio/core/v3';
import { McpConnectionDialog } from './mcp-connection-dialog';
import { SettingsRow } from './settings-row';

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
// The same field size as the other Settings dialogs' setting rows.
const FIELD = 'h-[1.875rem] text-[0.78125rem]';

const ADD_LABELS = {
  remote: 'MCP server URL',
  local: 'Local MCP command',
  import: 'Repository or host folder',
  upload: 'Upload ZIP',
  skill: 'Create a skill',
  plugin: 'Compose a plugin',
};

/** The kind the face of the Add button adds; the arrow lists every kind. */
function primaryKind(mcp: boolean, category?: ExtensionAdd['category']): ExtensionAdd['kind'] {
  if (mcp) return 'remote';
  if (category === 'skills') return 'skill';
  if (category === 'plugins') return 'plugin';
  return 'import';
}

/** The same Add split button in the extension library and infrastructure services. */
export function ExtensionAddMenu({
  onChoose,
  mcpOnly = false,
  category,
  label: labelOverride,
}: {
  onChoose: (choice: ExtensionAdd) => void;
  mcpOnly?: boolean;
  category?: ExtensionAdd['category'];
  /** Visible face label when the surrounding heading already names what is added. */
  label?: string;
}) {
  const supported = useExtensionsSupported();
  const mcp = mcpOnly || category === 'mcp';
  const label = labelOverride
    ? labelOverride
    : mcp
      ? 'Add MCP'
      : category === 'skills'
        ? 'Add skill'
        : category === 'plugins'
          ? 'Add plugin'
          : 'Add';
  const kinds = CHOICES.filter((kind) => {
    if (mcp) return kind === 'remote' || kind === 'local';
    if (category === 'skills') return kind === 'skill' || kind === 'import' || kind === 'upload';
    if (category === 'plugins') return kind === 'plugin' || kind === 'import' || kind === 'upload';
    return true;
  });
  return (
    <span className="inline-flex shrink-0 items-center gap-2.5">
      {supported !== true ? (
        <span className="text-xs whitespace-nowrap text-muted-foreground" role="status">
          {supported === false ? 'Needs a newer agent service' : 'Checking the agent service…'}
        </span>
      ) : null}
      <SplitButton
        disabled={supported !== true}
        icon={<AddIcon aria-hidden="true" />}
        label={label}
        menuLabel={`${label} options`}
        onClick={() => onChoose({ kind: primaryKind(mcp, category), category })}
        showLabel
        variant="outline"
      >
        {kinds.map((kind) => (
          <DropdownMenuItem key={kind} onSelect={() => onChoose({ kind, category })}>
            {kind === 'upload' && category
              ? `Upload ${category === 'skills' ? 'skill' : 'plugin'} ZIP`
              : ADD_LABELS[kind]}
          </DropdownMenuItem>
        ))}
      </SplitButton>
    </span>
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

/** One add surface; MCP connections get their own frame, sources and packages this one. */
export function ExtensionAddDialog(props: {
  choice: ExtensionAdd;
  connections: SavedMcpService[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onSignIn: (name: string) => void;
}) {
  const { choice } = props;
  if (choice.kind === 'remote' || choice.kind === 'local')
    return (
      <McpConnectionDialog
        connections={props.connections}
        initial={{
          title: choice.title,
          url: choice.url,
          command: choice.command,
          args: choice.args,
        }}
        kind={choice.kind}
        onClose={props.onClose}
        onSaved={props.onSaved}
        onSignIn={props.onSignIn}
      />
    );
  return <ExtensionSourceDialog {...props} />;
}

/** A drive letter, /, ~ or . : the source names a folder on the agent host, not a repository. */
const LOCAL_PATH = /^(?:[a-z]:[\\/]|[\\/~.])/iu;

/** A failed fetch reads as what happened; the service's own words stay on hover. */
function plainAddError(error: string, source: string): string {
  if (/no such file or directory|does not exist/iu.test(error))
    return 'That folder doesn’t exist on the agent host.';
  // The host reads a path as a file:// remote, so a bad folder fails as a git fetch.
  if (LOCAL_PATH.test(source.trim()))
    return 'That folder couldn’t be read as an extension source on the agent host.';
  if (/repository .*not found|could not read username|authentication failed/iu.test(error))
    return 'That repository couldn’t be found, or it needs access this agent host doesn’t have.';
  if (/git (fetch|clone)\b.*failed/iu.test(error)) return 'That repository couldn’t be fetched.';
  return error;
}

function ExtensionSourceDialog({
  choice,
  connections,
  onClose,
  onSaved,
}: {
  choice: ExtensionAdd;
  connections: SavedMcpService[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const repository = useRepository();
  const supported = useExtensionsSupported();
  const ids = useId();

  const [name, setName] = useState(choice.title ?? '');
  const [source, setSource] = useState(choice.source ?? '');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
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
      const key = slug(name);
      if (!key && choice.kind !== 'import')
        throw new Error('Include a letter or number in the extension name');
      if (choice.kind === 'plugin' && !refs.length && !selected.length)
        throw new Error('Choose at least one skill, plugin or MCP connection');
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add extension');
    } finally {
      setBusy(false);
    }
  }
  const importing = choice.kind === 'import';
  const missing = importing
    ? !source.trim()
    : !name.trim() ||
      (choice.kind === 'upload' && !file) ||
      ((choice.kind === 'skill' || choice.kind === 'plugin') && !description.trim()) ||
      (choice.kind === 'skill' && !instructions.trim());
  return (
    <DialogFrame
      confirm={{
        label: busy ? 'Adding…' : importing ? 'Install source' : 'Save to private marketplace',
        onConfirm: () => void save(),
        disabled: busy || supported !== true || missing,
      }}
      description={
        importing
          ? 'Install a marketplace, plugin or Agent Skills folder. The original source stays unchanged.'
          : choice.kind === 'plugin'
            ? 'Combine installed capabilities and saved connections. Credentials stay with their connection.'
            : choice.kind === 'upload'
              ? `Upload a ${choice.category === 'skills' ? 'skill' : 'plugin'} ZIP to your private marketplace.`
              : 'Save reusable instructions in your private marketplace.'
      }
      icon={<PackageIcon />}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      open
      title={
        choice.kind === 'upload' && choice.category
          ? `Upload a ${choice.category === 'skills' ? 'skill' : 'plugin'}`
          : TITLES[choice.kind]
      }
    >
      <form
        className="clio-scrollbar grid max-h-[min(62dvh,34rem)] overflow-y-auto"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !missing && supported === true) void save();
        }}
      >
        <SettingsRow
          htmlFor={`${ids}-name`}
          info={importing ? 'Optional. The source keeps its own name without one.' : undefined}
          title="Name"
        >
          <Input
            className={FIELD}
            data-initial-focus=""
            id={`${ids}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              importing
                ? 'Optional'
                : choice.kind === 'skill' || choice.category === 'skills'
                  ? 'My skill'
                  : choice.kind === 'plugin' || choice.category === 'plugins'
                    ? 'My plugin'
                    : 'My source'
            }
            required={!importing}
          />
        </SettingsRow>
        {importing ? (
          <SettingsRow
            htmlFor={`${ids}-source`}
            info="A repository URL, or a folder on the agent host."
            title="Source"
          >
            <Input
              className={FIELD}
              id={`${ids}-source`}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="https://github.com/homeassistant-ai/skills"
              required
            />
          </SettingsRow>
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
        {choice.kind === 'skill' || choice.kind === 'plugin' ? (
          <SettingsRow htmlFor={`${ids}-description`} title="Description">
            <Input
              className={FIELD}
              id={`${ids}-description`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
            />
          </SettingsRow>
        ) : null}
        {choice.kind === 'skill' ? (
          <SettingsRow htmlFor={`${ids}-instructions`} title="Instructions">
            <Textarea
              className="min-h-52 text-[0.78125rem]"
              id={`${ids}-instructions`}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="When to use this skill, what to do, and how to verify the outcome."
              required
            />
          </SettingsRow>
        ) : null}
        {choice.kind === 'plugin' ? (
          <>
            <PluginChoices values={refs} onChange={setRefs} />
            <ConnectionChoices connections={connections} values={selected} onChange={setSelected} />
          </>
        ) : null}
        {error ? (
          <p className="pt-2 text-xs text-destructive" role="alert" title={error}>
            {plainAddError(error, source)}
          </p>
        ) : null}
        {!importing ? (
          <p className="pt-2 text-xs text-faint">
            Saves to your Private local marketplace on this agent host. GitHub backup is available
            from Marketplaces.
          </p>
        ) : null}
        <button className="sr-only" tabIndex={-1} type="submit">
          Submit
        </button>
      </form>
    </DialogFrame>
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
