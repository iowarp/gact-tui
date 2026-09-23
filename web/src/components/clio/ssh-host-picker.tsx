import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  EyeOffIcon,
  FileKey2Icon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { vocab } from '@/lib/brand-vocabulary';
import { createSavedSshHost, profileSshHosts, type SshHost } from '@/lib/ssh-hosts';
import { storeSshIdentity } from '@/tauri/ssh-credentials';
import {
  deleteSshProfile,
  listSshProfiles,
  saveSshProfile,
  setSshProfileHidden,
} from '@/tauri/ssh-profiles';
import {
  closeSshConnectionTest,
  openSshConnectionTest,
  sshTransportStatus,
  type SshConnectionTest,
  type SshTransportStatus,
} from '@/tauri/ssh-infrastructure-transport';
import { SshAuthentication } from './managed-service-target';
import { SshConnectionRoute } from './ssh-connection-route';

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
  const [authError, setAuthError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<SshTransportStatus>();
  const [testSucceeded, setTestSucceeded] = useState(false);
  const [editingProfile, setEditingProfile] = useState<string>();
  const activeTest = useRef<SshConnectionTest | undefined>(undefined);
  const options = useMemo(() => profileSshHosts(profiles.data ?? []), [profiles.data]);
  const visibleOptions = useMemo(
    () =>
      value && !options.some((candidate) => candidate.id === value.id)
        ? [value, ...options]
        : options,
    [options, value],
  );

  const buildDraft = (): SshHost => ({
    ...createSavedSshHost({
      host,
      identityFile,
      label,
      installRoot,
      port: Number(port),
      user,
    }),
    jumpHosts,
    platform,
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
        name: editingProfile ?? profileName(candidate.label, candidate.host ?? ''),
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

  const resetForm = (candidate?: SshHost) => {
    setHost(candidate?.host ?? '');
    setUser(candidate?.user ?? '');
    setLabel(candidate?.label ?? '');
    setPort(String(candidate?.port ?? 22));
    setIdentityFile(candidate?.identityFile ?? '');
    setPrivateKey('');
    setInstallRoot(candidate?.installRoot ?? '');
    setJumpHost('');
    setJumpHosts(candidate?.jumpHosts ?? []);
    setPlatform(candidate?.platform ?? 'auto');
    setEditingProfile(candidate?.managed ? candidate.profile : undefined);
    setAuthError(undefined);
    setTestStatus(undefined);
    setTestSucceeded(false);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openConfigure = () => {
    resetForm(value);
    setOpen(true);
  };

  const changeDialogOpen = (nextOpen: boolean) => {
    if (!nextOpen && activeTest.current) {
      void closeSshConnectionTest(activeTest.current);
      activeTest.current = undefined;
      setTesting(false);
    }
    setOpen(nextOpen);
  };

  const testConnection = async () => {
    setTesting(true);
    setAuthError(undefined);
    setTestSucceeded(false);
    try {
      const candidate = await prepareDraft();
      const test = await openSshConnectionTest({
        profile: candidate.profile ?? '',
        host: candidate.host ?? '',
        user: candidate.user ?? '',
        port: candidate.port,
        jump_hosts: jumpHosts,
        identity_file: candidate.identityFile ?? '',
        platform,
      });
      activeTest.current = test;
      let status = test.status;
      setTestStatus(status);
      for (let attempt = 0; status.state !== 'connected' && attempt < 1_200; attempt += 1) {
        if (activeTest.current?.targetId !== test.targetId) return;
        if (status.state === 'disconnected') throw new Error('OpenSSH disconnected before login.');
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        status = await sshTransportStatus(status.session_id);
        activeTest.current = { ...test, status };
        setTestStatus(status);
      }
      if (status.state !== 'connected') throw new Error('SSH connection test timed out.');
      setTestSucceeded(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      if (activeTest.current) {
        await closeSshConnectionTest(activeTest.current).catch(() => undefined);
        activeTest.current = undefined;
      }
      setTesting(false);
    }
  };

  useEffect(
    () => () => {
      if (activeTest.current) void closeSshConnectionTest(activeTest.current);
    },
    [],
  );

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
    <div className="grid gap-2">
      <SshConnectionRoute
        onChange={onChange}
        onConfigureDestination={openConfigure}
        onCreateDestination={openCreate}
        options={visibleOptions}
        value={value}
      />

      {value ? (
        <Button
          aria-label={value.managed ? `Delete ${value.label}` : `Hide ${value.label}`}
          onClick={async () => {
            if (value.managed && value.profile) await deleteSshProfile(value.profile);
            else if (value.profile) await setSshProfileHidden(value.profile, true);
            onChange(undefined);
            await profiles.refetch();
          }}
          className="w-fit"
          size="sm"
          type="button"
          variant="ghost"
        >
          {value.managed ? <Trash2Icon aria-hidden="true" /> : <EyeOffIcon aria-hidden="true" />}{' '}
          {value.managed ? 'Delete saved computer' : 'Hide imported computer'}
        </Button>
      ) : null}

      <Dialog onOpenChange={changeDialogOpen} open={open}>
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

            <Field>
              <FieldLabel>Connection route</FieldLabel>
              <FieldDescription>
                Add jump hosts in connection order. After saving, the route appears on the front
                door where every step can be selected, configured, or reordered.
              </FieldDescription>
              <div className="mt-2 flex gap-2">
                <Input
                  aria-label="Jump host"
                  onChange={(event) => setJumpHost(event.target.value)}
                  placeholder="OpenSSH profile or user@gateway.example.edu"
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
                  <PlusIcon aria-hidden="true" /> Add jump
                </Button>
              </div>
              <DraftJumpHostChain onChange={setJumpHosts} value={jumpHosts} />
            </Field>

            <Field>
              <FieldLabel>OpenSSH authentication</FieldLabel>
              <FieldDescription>
                Password, Duo, security-key, Kerberos, and rolling-code prompts come directly from
                system OpenSSH during Test connection or deployment. {vocab.agent} never stores
                those answers. Optionally provide a private key override below.
              </FieldDescription>
              <Field className="mt-2">
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
              <div className="mt-3 flex items-center gap-3">
                <Button onClick={chooseIdentityFile} size="sm" type="button" variant="outline">
                  <FileKey2Icon aria-hidden="true" /> Choose key file
                </Button>
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {identityFile || 'Or use your SSH agent / OpenSSH configuration'}
                </span>
              </div>
            </Field>

            <details className="border-t pt-3">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                Advanced host settings
              </summary>
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
                <AlertTitle>SSH connection failed</AlertTitle>
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
            ) : null}

            {testStatus && !testSucceeded && testStatus.state !== 'connected' ? (
              <SshAuthentication
                output={testStatus.output}
                sessionId={testStatus.session_id}
                state={testStatus.state}
              />
            ) : null}

            {testSucceeded ? (
              <Alert className="border-success/40 text-success">
                <CheckCircle2Icon aria-hidden="true" />
                <AlertTitle>Connection succeeded</AlertTitle>
                <AlertDescription>
                  System OpenSSH reached the destination through the configured route.
                </AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button
                disabled={!host.trim() || saving || testing}
                onClick={() => void testConnection()}
                type="button"
                variant="outline"
              >
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
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

function DraftJumpHostChain({
  onChange,
  value,
}: {
  onChange: (value: string[]) => void;
  value: string[];
}) {
  if (!value.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {value.map((host, index) => (
        <div
          className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm"
          key={`${host}-${index}`}
        >
          <span className="grid size-5 place-items-center rounded-full border text-xs text-muted-foreground">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{host}</span>
          <Button
            aria-label={`Remove ${host}`}
            onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      ))}
    </div>
  );
}
