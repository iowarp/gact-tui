import { CheckCircle2Icon, ChevronDownIcon, FileKey2Icon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
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
import { saveSshProfile } from '@/tauri/ssh-profiles';
import {
  closeSshConnectionTest,
  openSshConnectionTest,
  sshTransportStatus,
  type SshConnectionTest,
  type SshTransportStatus,
} from '@/tauri/ssh-infrastructure-transport';
import { InfoTip } from './info-tip';
import { DeployFailure } from './deploy-progress';
import { SshAuthentication } from './managed-service-target';
import type { SshRouteStep } from './ssh-connection-route';
import {
  SshJumpAddressField,
  SshJumpHostList,
  SshJumpHostSelect,
  TYPE_SSH_ADDRESS,
} from './ssh-jump-host-list';
import { uniqueProfileName } from './ssh-route-utils';

/**
 * The one SSH computer configuration dialog. The route's destination and
 * every jump host open this same form; only where the saved computer lands
 * (`step`) differs, so every step is configured the same way.
 */
export function SshHostDialog({
  defaultIdentityFile,
  initial,
  onOpenChange,
  onSaved,
  open,
  options,
  step,
  via,
}: {
  /**
   * The key a brand-new computer starts with: the previous hop's, since
   * cluster nodes share the login node's home directory. Shown and changeable.
   */
  defaultIdentityFile?: string;
  /** Prefill: the computer being configured, or undefined to add a new one. */
  initial?: SshHost;
  onOpenChange: (open: boolean) => void;
  onSaved: (host: SshHost) => void;
  open: boolean;
  options: SshHost[];
  step: SshRouteStep;
  /**
   * Opened from a row of the route editor: the hops before that row. The
   * row's position is its route, so the dialog tests through these and shows
   * them read-only instead of offering a second route field.
   */
  via?: readonly string[];
}) {
  // Initialized once per open: the picker remounts this dialog (a new `key`)
  // every time it opens, so the form always starts from `initial`.
  const [host, setHost] = useState(initial?.host ?? '');
  const [user, setUser] = useState(initial?.user ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [port, setPort] = useState(String(initial?.port ?? 22));
  const [identityFile, setIdentityFile] = useState(
    initial ? (initial.identityFile ?? '') : (defaultIdentityFile ?? ''),
  );
  const [privateKey, setPrivateKey] = useState('');
  const [installRoot, setInstallRoot] = useState(initial?.installRoot ?? '');
  const [jumpHosts, setJumpHosts] = useState<string[]>(initial?.jumpHosts ?? []);
  const [platform, setPlatform] = useState<'auto' | 'linux' | 'windows'>(
    initial?.platform ?? 'auto',
  );
  const [authError, setAuthError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<SshTransportStatus>();
  const [testSucceeded, setTestSucceeded] = useState(false);
  const [testLog, setTestLog] = useState<string>();
  const activeTest = useRef<SshConnectionTest | undefined>(undefined);
  const [typingJump, setTypingJump] = useState(false);
  const isJump = !step.isDestination;
  // Only a computer CLIO saved is edited in place. Configuring an imported
  // OpenSSH host saves a new CLIO computer under a name that cannot collide
  // with (and so override) any existing alias.
  const editingProfile = initial?.managed ? initial.profile : undefined;
  const takenNames = options.flatMap((option) => (option.profile ? [option.profile] : []));
  // A computer is never offered as a jump on its own route.
  const jumpOptions = options.filter((option) => option.id !== initial?.id);

  const buildDraft = (): SshHost => ({
    ...createSavedSshHost({ host, identityFile, label, installRoot, port: Number(port), user }),
    // A jump host keeps its own route; the dialog only hides it for jump steps.
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
        name:
          editingProfile ?? uniqueProfileName(candidate.label, candidate.host ?? '', takenNames),
        label: candidate.label,
        hostname: candidate.host ?? '',
        user: candidate.user ?? '',
        port: candidate.port,
        identity_file: candidate.identityFile ?? '',
        jump_hosts: candidate.jumpHosts ?? [],
        platform,
        install_root: candidate.installRoot ?? '',
        managed_identity: Boolean(privateKey.trim()),
        replace_existing: Boolean(editingProfile),
      });
      setPrivateKey('');
      onSaved({
        ...profileSshHosts([profile])[0],
        label: candidate.label,
        installRoot: candidate.installRoot,
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && activeTest.current) {
      void closeSshConnectionTest(activeTest.current);
      activeTest.current = undefined;
      setTesting(false);
    }
    onOpenChange(nextOpen);
  };

  const testConnection = async () => {
    setTesting(true);
    setAuthError(undefined);
    setTestLog(undefined);
    setTestSucceeded(false);
    try {
      const candidate = await prepareDraft();
      const test = await openSshConnectionTest({
        profile: candidate.profile ?? '',
        host: candidate.host ?? '',
        user: candidate.user ?? '',
        port: candidate.port,
        // From the route editor, the row's position is its route.
        jump_hosts: via ? [...via] : (candidate.jumpHosts ?? []),
        identity_file: candidate.identityFile ?? '',
        platform,
      });
      activeTest.current = test;
      let status = test.status;
      setTestStatus(status);
      for (let attempt = 0; status.state !== 'connected' && attempt < 1_200; attempt += 1) {
        if (activeTest.current?.targetId !== test.targetId) return;
        if (status.state === 'disconnected') {
          // OpenSSH's own reason, with its cleaned log for Details.
          setTestLog(status.output);
          throw new Error(status.failure || 'OpenSSH disconnected before login.');
        }
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
    const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
    const selected = await openDialog({
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
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {/*
          The form covers only the host's own saved fields. SshAuthentication
          and the footer render as its SIBLINGS, not descendants: a <form>
          nested inside another <form> is invalid HTML, and the resulting
          nested DOM nodes let a native `submit` from the OpenSSH prompt (a
          form of its own) bubble into this one and silently save/close the
          host dialog as a side effect of answering a password prompt
          (#1437). The footer's submit button stays wired to this form via
          the `form` attribute instead of physical nesting.
        */}
        <div className="grid gap-5">
          <form className="grid gap-5" id="ssh-host-form" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{dialogTitle(step, initial)}</DialogTitle>
              <DialogDescription className="sr-only">
                Address, account, route, and key for one SSH computer.
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
            </Field>

            {via ? (
              via.length ? (
                <p className="text-sm text-muted-foreground" role="note">
                  Reached via {via.join(' → ')}
                </p>
              ) : null
            ) : isJump ? null : (
              <Field>
                <FieldLabel>Connection route</FieldLabel>
                <div className="mt-2 grid gap-2">
                  <SshJumpHostList
                    onChange={setJumpHosts}
                    options={jumpOptions}
                    value={jumpHosts}
                  />
                  {typingJump ? (
                    <SshJumpAddressField
                      onCancel={() => setTypingJump(false)}
                      onSubmit={(jump) => {
                        setTypingJump(false);
                        setJumpHosts((current) => [...current, jump]);
                      }}
                    />
                  ) : (
                    <SshJumpHostSelect
                      key={jumpHosts.length}
                      onChange={(jump) => {
                        if (jump === TYPE_SSH_ADDRESS) setTypingJump(true);
                        else setJumpHosts((current) => [...current, jump]);
                      }}
                      onCreate={false}
                      onTypeAddress
                      options={jumpOptions}
                      value=""
                    />
                  )}
                </div>
              </Field>
            )}

            <Field>
              <FieldLabel className="flex items-center gap-1.5">
                Authentication
                <InfoTip label="About authentication">
                  {`Passwords, Duo, security keys, and Kerberos are asked for by OpenSSH when you connect and never saved. A key is optional.`}
                </InfoTip>
              </FieldLabel>
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
                <span
                  className="min-w-0 truncate text-xs text-muted-foreground"
                  title={identityFile || undefined}
                >
                  {identityFile || 'Or use your SSH agent / OpenSSH configuration'}
                </span>
                {identityFile ? (
                  <Button
                    aria-label="Use the SSH agent or OpenSSH configuration instead"
                    onClick={() => setIdentityFile('')}
                    size="icon-sm"
                    title="Use the SSH agent or OpenSSH configuration instead"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </Field>

            <Collapsible className="border-t pt-3">
              <CollapsibleTrigger asChild>
                <Button
                  className="group w-fit px-0 text-muted-foreground hover:text-foreground"
                  type="button"
                  variant="link"
                >
                  Advanced host settings
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="transition-transform group-data-[state=open]:rotate-180"
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Field className="mt-3">
                  <FieldLabel htmlFor="ssh-host-platform">Remote platform</FieldLabel>
                  <Select
                    onValueChange={(next) => setPlatform(next as typeof platform)}
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
                </Field>
              </CollapsibleContent>
            </Collapsible>

            {authError ? (
              <DeployFailure details={testLog} reason={authError} title="SSH connection failed" />
            ) : null}
          </form>

          {/*
            Rendered outside the <form> above on purpose (see the comment at
            the top of this dialog): SshAuthentication is its own <form> for
            answering one OpenSSH prompt, and must never be a descendant of
            the host-config form.
          */}
          {testStatus?.prompt && !testSucceeded && testStatus.state !== 'connected' ? (
            <SshAuthentication prompt={testStatus.prompt} sessionId={testStatus.session_id} />
          ) : null}

          {testSucceeded ? (
            <Alert className="border-success/40 text-success">
              <CheckCircle2Icon aria-hidden="true" />
              <AlertTitle>Connection succeeded</AlertTitle>
              <AlertDescription>
                {via?.length
                  ? `Reached ${host.trim()} via ${via.join(' → ')}.`
                  : `Reached ${host.trim()}.`}
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
            <Button disabled={!host.trim() || saving} form="ssh-host-form" type="submit">
              {saving ? 'Saving…' : 'Save host'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function dialogTitle(step: SshRouteStep, initial?: SshHost): string {
  if (initial?.profile) return `Configure ${initial.label}`;
  if (step.isDestination) return initial ? 'Configure the destination' : 'Add an SSH host';
  return initial ? `Configure hop ${step.index + 1}` : 'Add a jump host';
}
