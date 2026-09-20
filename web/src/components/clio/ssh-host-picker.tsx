import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  FileKey2Icon,
  PlusIcon,
  ServerIcon,
  TriangleAlertIcon,
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
  readSavedSshHosts,
  saveSshHost,
  sshHostDestination,
  sshHostTarget,
  type SshHost,
} from '@/lib/ssh-hosts';
import { preflightTarget, sshProfiles } from '@/tauri/infrastructure-setup';
import { deleteSshPassword, storeSshIdentity, storeSshPassword } from '@/tauri/ssh-credentials';

export function SshHostPicker({
  onChange,
  value,
}: {
  onChange: (host: SshHost | undefined) => void;
  value?: SshHost;
}) {
  const profiles = useQuery({
    queryKey: ['managed-service-ssh-profiles'],
    queryFn: sshProfiles,
    staleTime: 60_000,
  });
  const [saved, setSaved] = useState(readSavedSshHosts);
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState('');
  const [user, setUser] = useState('');
  const [label, setLabel] = useState('');
  const [port, setPort] = useState('22');
  const [identityFile, setIdentityFile] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [password, setPassword] = useState('');
  const [installRoot, setInstallRoot] = useState('');
  const [authMethod, setAuthMethod] = useState<'key' | 'password'>('key');
  const [authError, setAuthError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<SshHost>();
  const options = useMemo(
    () => [...profileSshHosts(profiles.data ?? []), ...saved],
    [profiles.data, saved],
  );
  const test = useMutation({
    mutationFn: (candidate: SshHost) => preflightTarget(sshHostTarget(candidate)),
  });

  const buildDraft = (): SshHost =>
    createSavedSshHost({
      host,
      identityFile,
      authMethod,
      label,
      installRoot,
      port: Number(port),
      user,
    });

  const prepareDraft = async (): Promise<SshHost> => {
    let candidate = buildDraft();
    if (authMethod === 'password') {
      if (!password) throw new Error('Enter the SSH password.');
      await storeSshPassword(candidate.credentialId!, password);
      return candidate;
    }
    await deleteSshPassword(candidate.credentialId!);
    if (privateKey.trim()) {
      const storedPath = await storeSshIdentity(candidate.credentialId!, privateKey);
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
      const updated = saveSshHost(candidate);
      setSaved(updated);
      onChange(candidate);
      setPassword('');
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
        onValueChange={(id) => onChange(options.find((candidate) => candidate.id === id))}
        value={value?.id ?? ''}
      >
        <SelectTrigger aria-label="Saved SSH host" className="min-w-0 flex-1">
          <SelectValue placeholder="Choose a host" />
        </SelectTrigger>
        <SelectContent>
          {options.map((candidate) => (
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
                Use a host without editing your OpenSSH config. Choose password or key
                authentication, then test it before saving.
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
                <Field>
                  <FieldLabel htmlFor="ssh-host-password">Password</FieldLabel>
                  <Input
                    autoComplete="current-password"
                    id="ssh-host-password"
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    value={password}
                  />
                  <FieldDescription>
                    Stored in the operating-system credential vault, never in the host list.
                  </FieldDescription>
                </Field>
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

            {test.isSuccess ? (
              <Alert>
                <CheckCircle2Icon aria-hidden="true" />
                <AlertTitle>Connection succeeded</AlertTitle>
                <AlertDescription>
                  {test.data.os} · {test.data.arch} · Docker{' '}
                  {test.data.docker_available ? 'ready' : 'not running'}
                </AlertDescription>
              </Alert>
            ) : null}
            {test.error ? (
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>Could not connect</AlertTitle>
                <AlertDescription>{test.error.message}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="sm:justify-between">
              <Button
                disabled={!host.trim() || test.isPending || saving}
                onClick={async () => {
                  setAuthError(undefined);
                  try {
                    const candidate = await prepareDraft();
                    setDraft(candidate);
                    test.mutate(candidate);
                  } catch (error) {
                    setAuthError(error instanceof Error ? error.message : String(error));
                  }
                }}
                type="button"
                variant="outline"
              >
                {test.isPending && draft ? `Testing ${draft.label}…` : 'Test connection'}
              </Button>
              <Button
                disabled={!host.trim() || saving || (authMethod === 'password' && !password)}
                type="submit"
              >
                {saving ? 'Saving…' : 'Save host'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
