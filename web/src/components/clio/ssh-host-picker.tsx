import { useQuery } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVerticalIcon,
  EyeOffIcon,
  FileKey2Icon,
  PlusIcon,
  ServerIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { vocab } from '@/lib/brand-vocabulary';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createSavedSshHost,
  profileSshHosts,
  sshHostDestination,
  type SshHost,
} from '@/lib/ssh-hosts';
import { storeSshIdentity } from '@/tauri/ssh-credentials';
import {
  deleteSshProfile,
  listSshProfiles,
  saveSshProfile,
  setSshProfileHidden,
} from '@/tauri/ssh-profiles';

export function SshHostPicker({
  onChange,
  value,
}: {
  onChange: (host: SshHost | undefined) => void;
  value?: SshHost;
}) {
  const profiles = useQuery({
    queryKey: ['managed-service-ssh-profiles'],
    queryFn: listSshProfiles,
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState('');
  const [user, setUser] = useState('');
  const [label, setLabel] = useState('');
  const [port, setPort] = useState('22');
  const [identityFile, setIdentityFile] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [installRoot, setInstallRoot] = useState('');
  const [jumpHost, setJumpHost] = useState('');
  const [jumpHosts, setJumpHosts] = useState<string[]>([]);
  const [platform, setPlatform] = useState<'auto' | 'linux' | 'windows'>('auto');
  const [authMethod, setAuthMethod] = useState<'key' | 'password'>('key');
  const [authError, setAuthError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => profileSshHosts(profiles.data ?? []), [profiles.data]);
  const visibleOptions = useMemo(
    () =>
      value && !options.some((candidate) => candidate.id === value.id)
        ? [value, ...options]
        : options,
    [options, value],
  );

  const buildDraft = (): SshHost =>
    createSavedSshHost({
      host,
      identityFile,
      label,
      installRoot,
      port: Number(port),
      user,
    });

  const prepareDraft = async (): Promise<SshHost> => {
    let candidate = buildDraft();
    if (privateKey.trim()) {
      const storedPath = await storeSshIdentity(candidate.id, privateKey);
      candidate = { ...candidate, identityFile: storedPath };
    }
    return candidate;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setAuthError(undefined);
    try {
      const candidate = await prepareDraft();
      const profile = await saveSshProfile({
        name: profileName(candidate.label, candidate.host ?? ''),
        label: candidate.label,
        hostname: candidate.host ?? '',
        user: candidate.user ?? '',
        port: candidate.port,
        identity_file: candidate.identityFile ?? '',
        jump_hosts: jumpHosts,
        platform,
        install_root: candidate.installRoot ?? '',
        managed_identity: Boolean(privateKey.trim()),
      });
      await profiles.refetch();
      onChange({
        ...profileSshHosts([profile])[0],
        label: candidate.label,
        installRoot: candidate.installRoot,
      });
      setPrivateKey('');
      setOpen(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const chooseIdentityFile = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: false,
      multiple: false,
      title: 'Choose an SSH private key',
    });
    if (typeof selected === 'string') {
      setIdentityFile(selected);
      setPrivateKey('');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        onValueChange={(id) => onChange(visibleOptions.find((candidate) => candidate.id === id))}
        value={value?.id ?? ''}
      >
        <SelectTrigger aria-label="Saved SSH host" className="min-w-0 flex-1">
          <SelectValue placeholder="Choose a host" />
        </SelectTrigger>
        <SelectContent>
          {visibleOptions.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              <span className="flex min-w-0 items-center gap-2">
                <ServerIcon aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{candidate.label}</span>
                {sshHostDestination(candidate) !== candidate.label ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {sshHostDestination(candidate)}
                  </span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value ? (
        <Button
          aria-label={value.managed ? `Delete ${value.label}` : `Hide ${value.label}`}
          onClick={async () => {
            if (value.managed && value.profile) await deleteSshProfile(value.profile);
            else if (value.profile) await setSshProfileHidden(value.profile, true);
            onChange(undefined);
            await profiles.refetch();
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          {value.managed ? <Trash2Icon aria-hidden="true" /> : <EyeOffIcon aria-hidden="true" />}
        </Button>
      ) : null}

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>
          <Button aria-label="Add SSH host" size="icon" type="button" variant="outline">
            <PlusIcon aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <form className="grid gap-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Add an SSH host</DialogTitle>
              <DialogDescription>
                Save a non-secret OpenSSH target. Passwords, Duo, security keys, Kerberos, and
                rolling credentials are requested interactively by system OpenSSH.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
              <Field>
                <FieldLabel htmlFor="ssh-host-address">Address</FieldLabel>
                <Input
                  autoComplete="off"
                  id="ssh-host-address"
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="10.0.0.102 or login.example.edu"
                  required
                  value={host}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ssh-host-port">Port</FieldLabel>
                <Input
                  id="ssh-host-port"
                  max={65_535}
                  min={1}
                  onChange={(event) => setPort(event.target.value)}
                  required
                  type="number"
                  value={port}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="ssh-host-user">Username</FieldLabel>
              <Input
                autoComplete="username"
                id="ssh-host-user"
                onChange={(event) => setUser(event.target.value)}
                placeholder="alice"
                value={user}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ssh-host-label">Name</FieldLabel>
              <Input
                autoComplete="off"
                id="ssh-host-label"
                onChange={(event) => setLabel(event.target.value)}
                placeholder="For example, Utah cluster"
                value={label}
              />
              <FieldDescription>Shown in deployment target pickers.</FieldDescription>
            </Field>

            <Tabs
              onValueChange={(value) => setAuthMethod(value as 'key' | 'password')}
              value={authMethod}
            >
              <FieldLabel>Authentication</FieldLabel>
              <TabsList aria-label="SSH authentication" className="grid w-full grid-cols-2">
                <TabsTrigger value="password">Password</TabsTrigger>
                <TabsTrigger value="key">Key</TabsTrigger>
              </TabsList>
              <TabsContent className="pt-2" value="password">
                <p className="text-sm text-muted-foreground">
                  OpenSSH will show the server’s exact interactive prompts when this target is
                  connected. {vocab.agent} does not save the answers.
                </p>
              </TabsContent>
              <TabsContent className="space-y-3 pt-2" value="key">
                <Field>
                  <FieldLabel htmlFor="ssh-host-private-key">Paste a private key</FieldLabel>
                  <Textarea
                    autoComplete="off"
                    className="min-h-28 font-mono text-xs"
                    id="ssh-host-private-key"
                    onChange={(event) => {
                      setPrivateKey(event.target.value);
                      if (event.target.value) setIdentityFile('');
                    }}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    spellCheck={false}
                    value={privateKey}
                  />
                </Field>
                <div className="flex items-center gap-3">
                  <Button onClick={chooseIdentityFile} size="sm" type="button" variant="outline">
                    <FileKey2Icon aria-hidden="true" /> Choose key file
                  </Button>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {identityFile || 'Or use your SSH agent / OpenSSH configuration'}
                  </span>
                </div>
              </TabsContent>
            </Tabs>

            <details className="border-t pt-3">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                Advanced host settings
              </summary>
              <Field className="mt-3">
                <FieldLabel>Jump hosts</FieldLabel>
                <FieldDescription>
                  Add any ProxyJump chain in connection order. Drag rows to reorder it.
                </FieldDescription>
                <div className="mt-2 flex gap-2">
                  <Input
                    aria-label="Jump host"
                    onChange={(event) => setJumpHost(event.target.value)}
                    placeholder="gateway.example.edu"
                    value={jumpHost}
                  />
                  <Button
                    disabled={!jumpHost.trim()}
                    onClick={() => {
                      setJumpHosts((current) => [...current, jumpHost.trim()]);
                      setJumpHost('');
                    }}
                    type="button"
                    variant="outline"
                  >
                    Add
                  </Button>
                </div>
                <JumpHostChain onChange={setJumpHosts} value={jumpHosts} />
              </Field>
              <Field className="mt-3">
                <FieldLabel htmlFor="ssh-host-platform">Remote platform</FieldLabel>
                <Select
                  onValueChange={(value) => setPlatform(value as typeof platform)}
                  value={platform}
                >
                  <SelectTrigger id="ssh-host-platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Detect automatically</SelectItem>
                    <SelectItem value="linux">Linux / macOS shell</SelectItem>
                    <SelectItem value="windows">Windows PowerShell</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="mt-3">
                <FieldLabel htmlFor="ssh-host-install-root">
                  {vocab.agent} install and runtime location
                </FieldLabel>
                <Input
                  autoComplete="off"
                  id="ssh-host-install-root"
                  onChange={(event) => setInstallRoot(event.target.value)}
                  placeholder="$HOME/.local/share/clio"
                  value={installRoot}
                />
                <FieldDescription>
                  Leave empty to use the remote user’s home directory. On a shared system, choose a
                  writable persistent location such as /mnt/common/alice/clio.
                </FieldDescription>
              </Field>
            </details>

            {authError ? (
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>Authentication could not be saved</AlertTitle>
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button disabled={!host.trim() || saving} type="submit">
                {saving ? 'Saving…' : 'Save host'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function profileName(label: string, host: string): string {
  const source = label.trim() || host.trim();
  const slug = source
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLocaleLowerCase();
  return slug || `clio-host-${Date.now()}`;
}

function JumpHostChain({
  onChange,
  value,
}: {
  onChange: (value: string[]) => void;
  value: string[];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = value.indexOf(String(active.id));
    const to = value.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onChange(arrayMove(value, from, to));
  };
  if (!value.length) return null;
  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={dragEnd} sensors={sensors}>
      <SortableContext items={value} strategy={verticalListSortingStrategy}>
        <div className="mt-2 space-y-2">
          {value.map((host) => (
            <JumpHostRow
              host={host}
              key={host}
              onRemove={() => onChange(value.filter((candidate) => candidate !== host))}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function JumpHostRow({ host, onRemove }: { host: string; onRemove: () => void }) {
  // oxlint-disable react/refs -- dnd-kit intentionally returns ref-backed drag props for rendering.
  const sortable = useSortable({ id: host });
  return (
    <div
      className="flex items-center gap-2 border bg-background px-2 py-1.5 text-sm"
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
    >
      <button
        aria-label={`Drag ${host} to reorder`}
        className="cursor-grab text-muted-foreground"
        type="button"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVerticalIcon aria-hidden="true" className="size-4" />
      </button>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{host}</span>
      <Button
        aria-label={`Remove ${host}`}
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
