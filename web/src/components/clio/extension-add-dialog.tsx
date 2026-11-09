import type { LocalExtensionInput } from '@clio/core/v3';
import { useRef, useState } from 'react';
import { PackageIcon, BoxesIcon, CableIcon } from 'lucide-react';
import { AddIcon } from '@/lib/icon-vocabulary';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { usePluginCatalog, useExtensionsSupported } from '@/hooks/use-session-agent';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { SplitButton } from './primitives/split-button';
import type { SavedMcpService } from '@clio/core/v3';
import { McpConnectionDialog } from './mcp-connection-dialog';

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
            {importing
              ? 'Install a marketplace, plugin or Agent Skills folder. The original source stays unchanged.'
              : choice.kind === 'plugin'
                ? 'Combine installed capabilities and saved connections. Credentials stay with their connection.'
                : choice.kind === 'upload'
                  ? `Upload a ${choice.category === 'skills' ? 'skill' : 'plugin'} ZIP to your private marketplace.`
                  : 'Save reusable instructions in your private marketplace.'}
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
                choice.kind === 'skill' || choice.category === 'skills'
                  ? 'My skill'
                  : choice.kind === 'plugin' || choice.category === 'plugins'
                    ? 'My plugin'
                    : 'My source'
              }
              required={!importing}
            />
          </Label>
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
          {!importing ? (
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
              {busy ? 'Adding…' : importing ? 'Install source' : 'Save to private marketplace'}
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
