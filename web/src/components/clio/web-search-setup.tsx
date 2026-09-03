import {
  WEB_SEARCH_DEFAULT_LOCAL_URL,
  webSearchDeploymentCommand,
  webSearchMcpArgs,
  webSearchUrlForHost,
} from '@/lib/web-search-service';
import { queryKeys } from '@/lib/query-keys';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { deployWebSearch, sshProfiles, type SshProfile } from '@/tauri/infrastructure-setup';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  ClipboardIcon,
  ContainerIcon,
  Globe2Icon,
  LaptopIcon,
  ServerIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';

type SetupTarget = 'local' | 'ssh' | 'existing';



export function WebSearchSetup({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const desktop = inTauri();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [target, setTarget] = useState<SetupTarget>('local');
  const [profileName, setProfileName] = useState('');
  const [serviceUrl, setServiceUrl] = useState(WEB_SEARCH_DEFAULT_LOCAL_URL);
  const [contactEmail, setContactEmail] = useState('');
  const [deploymentReady, setDeploymentReady] = useState(false);
  const profiles = useQuery({
    enabled: open && desktop,
    queryKey: ['desktop-ssh-profiles'],
    queryFn: sshProfiles,
  });
  const selectTarget = (value: SetupTarget) => {
    setTarget(value);
    setDeploymentReady(false);
    if (value === 'local') setServiceUrl(WEB_SEARCH_DEFAULT_LOCAL_URL);
    if (value === 'ssh' || value === 'existing') setServiceUrl('');
  };
  const selectProfile = (value: string) => {
    setProfileName(value);
    const profile = profiles.data?.find((candidate) => candidate.name === value);
    if (profile?.hostname) setServiceUrl(webSearchUrlForHost(profile.hostname));
  };

  const refreshMcp = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.key('mcp-servers', settings.endpoint) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.key('tools', settings.endpoint) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.key('agents', settings.endpoint) }),
    ]);
  };
  const connect = useMutation({
    mutationFn: () =>
      repository.installMcpServer({
        name: 'CLIO Web Search',
        transport: 'stdio',
        command: 'uvx',
        args: webSearchMcpArgs(serviceUrl.trim()),
      }),
    onSuccess: async () => {
      await refreshMcp();
      toast.success('Web search is ready for agents');
      handleOpenChange(false);
    },
    onError: (error) => toast.error('Web search could not connect', { description: error.message }),
  });
  const deploy = useMutation({
    mutationFn: () =>
      deployWebSearch({
        target: target === 'ssh' ? 'ssh' : 'local',
        ...(target === 'ssh' ? { ssh_profile: profileName } : {}),
        ...(contactEmail.trim() ? { contact_email: contactEmail.trim() } : {}),
      }),
    onSuccess: (result) => {
      setDeploymentReady(true);
      toast.success(
        result.action === 'already_running'
          ? `Web Search is already running on ${result.target}`
          : `Web Search started on ${result.target}`,
      );
    },
    onError: (error) => toast.error('Web Search could not start', { description: error.message }),
  });
  const command = useMemo(
    () => deploymentCommand(target, profileName, contactEmail.trim()),
    [contactEmail, profileName, target],
  );
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      connect.reset();
      deploy.reset();
      setTarget('local');
      setProfileName('');
      setServiceUrl(WEB_SEARCH_DEFAULT_LOCAL_URL);
      setContactEmail('');
      setDeploymentReady(false);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="grid max-h-[min(760px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Set up web search and document reading</DialogTitle>
          <DialogDescription>
            CLIO Web Search gives agents private web search, PDF conversion, scholarly metadata, and
            traceable sources.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
          <Field>
            <FieldLabel>Where will CLIO Web Search run?</FieldLabel>
            <RadioGroup
              className="grid gap-2 sm:grid-cols-3"
              onValueChange={(value) => selectTarget(value as SetupTarget)}
              value={target}
            >
              <SetupChoice
                description="Docker on this device"
                icon={LaptopIcon}
                label="This computer"
                value="local"
              />
              <SetupChoice
                description="Use a saved SSH host"
                icon={ServerIcon}
                label="Another computer"
                value="ssh"
              />
              <SetupChoice
                description="Connect by address"
                icon={Globe2Icon}
                label="Already running"
                value="existing"
              />
            </RadioGroup>
          </Field>

          {target === 'ssh' ? (
            desktop ? (
              <Field>
                <FieldLabel htmlFor="web-search-ssh-profile">SSH host</FieldLabel>
                <Select onValueChange={selectProfile} value={profileName}>
                  <SelectTrigger id="web-search-ssh-profile">
                    <SelectValue placeholder="Choose a saved SSH profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {(profiles.data ?? []).map((profile) => (
                      <SelectItem key={profile.name} value={profile.name}>
                        {profileLabel(profile)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Read from your OpenSSH config. CLIO uses the same keys and authentication as
                  <code className="mx-1 font-mono">ssh {profileName || 'host'}</code>.
                </FieldDescription>
                {profiles.isSuccess && !profiles.data.length ? (
                  <p className="text-sm text-muted-foreground">
                    No named hosts were found in your SSH config. Add one there or use an existing
                    service address.
                  </p>
                ) : null}
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="web-search-ssh-profile-manual">SSH profile</FieldLabel>
                <Input
                  id="web-search-ssh-profile-manual"
                  onChange={(event) => setProfileName(event.target.value)}
                  placeholder="homelab"
                  value={profileName}
                />
                <FieldDescription>
                  The browser cannot read your SSH config. Enter the same host name you use with
                  SSH, or use the desktop app to select it.
                </FieldDescription>
              </Field>
            )
          ) : null}

          {target !== 'existing' ? (
            <section className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <ContainerIcon aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Deploy the service</h3>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {desktop
                      ? 'The desktop app starts the supported container and keeps its data in a Docker volume.'
                      : 'Run this one command on the selected computer, then connect it below.'}
                  </p>
                </div>
              </div>
              <Collapsible className="mt-3">
                <CollapsibleTrigger asChild>
                  <Button className="h-auto px-0" size="sm" type="button" variant="link">
                    Publication metadata email (optional)
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Input
                    aria-label="Publication metadata email"
                    onChange={(event) => setContactEmail(event.target.value)}
                    placeholder="scientist@example.org"
                    type="email"
                    value={contactEmail}
                  />
                </CollapsibleContent>
              </Collapsible>
              {desktop ? (
                <Button
                  className="mt-3"
                  disabled={deploy.isPending || (target === 'ssh' && !profileName)}
                  onClick={() => deploy.mutate()}
                  type="button"
                >
                  <ContainerIcon aria-hidden="true" />
                  {deploy.isPending
                    ? 'Starting…'
                    : deploymentReady
                      ? 'Started'
                      : 'Deploy Web Search'}
                </Button>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <code className="max-h-28 min-w-0 flex-1 overflow-y-auto break-all rounded-lg border bg-background p-3 text-xs">
                    {command}
                  </code>
                  <Button
                    aria-label="Copy deployment command"
                    disabled={target === 'ssh' && !profileName}
                    onClick={() => void copyText(command)}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <ClipboardIcon aria-hidden="true" />
                  </Button>
                </div>
              )}
              {target === 'ssh' ? (
                <Alert className="mt-3">
                  <ServerIcon aria-hidden="true" />
                  <AlertTitle>Private network only</AlertTitle>
                  <AlertDescription>
                    Remote setup exposes the search and task ports to that host’s network. Use a
                    trusted LAN or private overlay address, never a public interface.
                  </AlertDescription>
                </Alert>
              ) : null}
            </section>
          ) : null}

          <Field>
            <FieldLabel htmlFor="web-search-service-url">Service address</FieldLabel>
            <Input
              id="web-search-service-url"
              onChange={(event) => setServiceUrl(event.target.value)}
              placeholder={WEB_SEARCH_DEFAULT_LOCAL_URL}
              type="url"
              value={serviceUrl}
            />
            <FieldDescription>
              This must be reachable from the connected agent service, not only from this browser.
            </FieldDescription>
            {connect.isPending ? (
              <p className="text-sm text-muted-foreground">
                Preparing the Web MCP and checking the service…
              </p>
            ) : null}
          </Field>

          {connect.error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not connect the Web MCP</AlertTitle>
              <AlertDescription>{connect.error.message}</AlertDescription>
            </Alert>
          ) : null}
          {deploymentReady ? (
            <Alert>
              <CheckCircle2Icon aria-hidden="true" />
              <AlertTitle>Container started</AlertTitle>
              <AlertDescription>
                First startup warms the document models. Connect when the service reports ready.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!serviceUrl.trim() || connect.isPending}
            onClick={() => connect.mutate()}
            type="button"
          >
            <Globe2Icon aria-hidden="true" />
            {connect.isPending ? 'Connecting…' : 'Connect to agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SetupChoice({
  description,
  icon: Icon,
  label,
  value,
}: {
  description: string;
  icon: typeof LaptopIcon;
  label: string;
  value: SetupTarget;
}) {
  return (
    <FieldLabel
      className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 has-[[data-state=checked]]:border-primary"
      htmlFor={`web-search-target-${value}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          {description}
        </span>
      </span>
      <RadioGroupItem id={`web-search-target-${value}`} value={value} />
    </FieldLabel>
  );
}

function profileLabel(profile: SshProfile): string {
  const destination = [profile.user, profile.hostname].filter(Boolean).join('@');
  return destination ? `${profile.name} — ${destination}` : profile.name;
}

function deploymentCommand(target: SetupTarget, profileName: string, contactEmail: string): string {
  return webSearchDeploymentCommand({
    bindAddress: target === 'ssh' ? '0.0.0.0' : '127.0.0.1',
    contactEmail,
    sshProfile: target === 'ssh' && profileName ? profileName : undefined,
  });
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success('Deployment command copied');
  } catch {
    toast.error('Could not copy the deployment command');
  }
}
