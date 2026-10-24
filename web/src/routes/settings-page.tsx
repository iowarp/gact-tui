import { vocab } from '@/lib/brand-vocabulary';
import { SettingsRow, SettingsChoice } from '@/components/clio/settings-row';
import { connectionScope } from '@/lib/connection-scope';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { SettingsNavigation } from '@/components/clio/settings-navigation';
import { settingsDestinations } from '@/lib/application-destinations';
import { queryKeys } from '@/lib/query-keys';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CableIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  KeyRoundIcon,
  BugIcon,
  MonitorCogIcon,
  MoonIcon,
  NotebookPenIcon,
  SunIcon,
  Volume2Icon,
} from 'lucide-react';
import { DeleteIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { useEffect, useRef, type ComponentType, type SVGProps } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ClioStatus } from '@/components/clio/status';
import { PluginSettings } from '@/components/clio/settings-plugins';
import { RelaySettings } from '@/components/clio/relay-settings';
import { AgentSettings } from '@/components/clio/settings-agents';
import { SystemSettings } from '@/components/clio/settings-operations';
import { PermissionPoliciesPanel } from '@/components/clio/settings-permissions';
import { ToolsSettings } from '@/components/clio/settings-tools';
import { ScheduleSettings } from '@/components/clio/settings-schedules';
import { SessionDefaultsSettings } from '@/components/clio/settings-session-defaults';
import { RuntimeSettingsPanel } from '@/components/clio/settings-runtime';
import { FleetSettingsPanel } from '@/components/clio/settings-fleet';
import { UsageSettings } from '@/components/clio/settings-usage';
import { ModelsSettings } from '@/components/clio/settings-models';
import { ProvidersSettings } from '@/components/clio/settings-providers';
import { DataSourceSettings } from '@/components/clio/settings-data-sources';
import { GeneralSettings } from '@/components/clio/settings-general';
import { AboutSettings } from '@/components/clio/settings-about';
import { PromptsCommandsSettings } from '@/components/clio/settings-prompts';
import { MemorySettings } from '@/components/clio/settings-memory';
import { ContextHistorySettings } from '@/components/clio/settings-context-history';
import { SettingsSectionHeading as SectionHeading } from '@/components/clio/settings-section-heading';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/clio/settings-frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { useSwitchConnection } from '@/hooks/use-switch-connection';
import { useKnownConnections, type KnownConnection } from '@/hooks/use-known-connections';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  type AttentionSoundMode,
  useNotificationPreferences,
} from '@/providers/notification-preferences-provider';
import { playAttentionSound } from '@/lib/attention-sound';
import {
  type ConversationWidth,
  type InterfaceSize,
  type MotionPreference,
  useAppearancePreferences,
  useTheme,
} from '@/providers/appearance-provider';
import { THEMES, type ThemeId, type ThemePreference } from '@/theme/contract';
import {
  returnRouteFromState,
  sessionIdFromRoute,
  workspaceIdFromRoute,
} from '@/lib/workspace-route-memory';

function ConnectionsSettings() {
  const repository = useRepository();
  const { settings, forget } = useConnectionSettings();
  const knownConnections = useKnownConnections();
  const switchConnection = useSwitchConnection();
  const connectionSwitch = useMutation({
    mutationFn: (connection: KnownConnection) =>
      switchConnection(connection, { navigateToWorkspace: false }),
  });
  const capabilities = useQuery({
    queryKey: queryKeys.key('capabilities', settings.endpoint),
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  const degradations = capabilities.data?.degradations ?? [];
  const connectionState = capabilities.isPending
    ? 'connecting'
    : capabilities.isError
      ? 'offline'
      : degradations.length
        ? 'degraded'
        : 'healthy';
  const limitationLabels = degradations.map((degradation) => degradation.reason);

  return (
    <div className="grid gap-6">
      <SectionHeading
        description="Choose where your workspace runs and manage known services."
        title={`${vocab.agent} connections`}
      />
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>Current connection</FrameTitle>
          <FrameDescription>
            The app reconnects to the most recently used address when it opens.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-wrap items-center gap-4">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <CableIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {settings.label || new URL(settings.endpoint).host}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">{settings.endpoint}</p>
            {limitationLabels.length ? (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>Some features are unavailable on this connection.</span>
              </div>
            ) : null}
          </div>
          <ClioStatus
            detail={
              capabilities.isError
                ? 'This agent could not be reached.'
                : limitationLabels.length
                  ? 'Open Unavailable features to see what this service provides.'
                  : undefined
            }
            label={
              connectionState === 'healthy'
                ? 'Connected'
                : connectionState === 'degraded'
                  ? 'Limited'
                  : undefined
            }
            value={connectionState}
          />
        </FramePanel>
        {limitationLabels.length ? (
          <details className="text-sm">
            <summary className="w-fit cursor-pointer rounded py-1 text-muted-foreground hover:text-foreground focus-visible:outline-ring">
              Unavailable features ({limitationLabels.length})
            </summary>
            <ul className="mt-2 grid list-disc gap-2 pl-5 text-sm leading-5 text-muted-foreground">
              {limitationLabels.map((reason, index) => (
                <li key={`${index}-${reason}`}>{reason}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <FrameFooter className="items-start">
          <Button asChild size="sm" variant="outline">
            <Link to="/?intent=connect">Add or test a service</Link>
          </Button>
        </FrameFooter>
      </Frame>
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>Known services</FrameTitle>
          <FrameDescription>
            Connect to another service or remove a remembered address from this device.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-1 p-2">
          {knownConnections.map((connection) => {
            const active = connection.endpoint === settings.endpoint;
            return (
              <div
                className="flex min-w-0 items-center gap-3 rounded-lg border border-transparent px-3 py-2 hover:border-border hover:bg-accent/50 focus-within:border-ring"
                key={connection.endpoint}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {connection.label || new URL(connection.endpoint).host}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {connection.endpoint}
                  </p>
                </div>
                {active ? <Badge variant="secondary">Current</Badge> : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={`Service actions for ${connection.label || connection.endpoint}`}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <MoreIcon aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuItem
                      disabled={
                        active ||
                        connectionSwitch.isPending ||
                        connection.availability.state === 'unavailable'
                      }
                      onSelect={() => connectionSwitch.mutate(connection)}
                    >
                      <CableIcon aria-hidden="true" /> Connect
                    </DropdownMenuItem>
                    {connection.source === 'recent' ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={active}
                          onSelect={() => void forget(connection.endpoint)}
                          variant="destructive"
                        >
                          <DeleteIcon aria-hidden="true" /> Forget on this device
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          {knownConnections.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No known services yet.</p>
          ) : null}
          {connectionSwitch.error ? (
            <p className="p-3 text-sm text-destructive sm:col-span-2">
              {connectionSwitch.error.message}
            </p>
          ) : null}
        </FramePanel>
      </Frame>
    </div>
  );
}

function PermissionsSettings({ workspaceId }: { workspaceId?: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const permissions = useQuery({
    queryKey: queryKeys.key('permissions', settings.endpoint),
    queryFn: ({ signal }) => repository.permissions(signal),
  });
  return (
    <div className="grid gap-6">
      <SectionHeading
        description="Review requests that need your decision. The agent cannot approve its own protected actions."
        title="Permissions"
      />
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>Requests</FrameTitle>
          <FrameDescription>
            Only decisions reported by the service are shown here.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-2">
          {permissions.data?.map((permission) => (
            <Alert
              key={permission.id}
              variant={permission.risk === 'high' ? 'destructive' : 'default'}
            >
              <KeyRoundIcon aria-hidden="true" />
              <AlertTitle>{permission.tool_name}</AlertTitle>
              <AlertDescription>
                {permission.reason ?? 'No reason was provided.'}, {permission.status ?? 'pending'}
              </AlertDescription>
            </Alert>
          ))}
          {permissions.data?.length === 0 ? (
            <Alert>
              <CheckCircle2Icon aria-hidden="true" />
              <AlertTitle>No permission requests</AlertTitle>
              <AlertDescription>
                There are no pending or recorded decisions on this connection.
              </AlertDescription>
            </Alert>
          ) : null}
          {permissions.isError ? (
            <Alert variant="destructive">
              <KeyRoundIcon aria-hidden="true" />
              <AlertTitle>Permissions unavailable</AlertTitle>
              <AlertDescription>{permissions.error.message}</AlertDescription>
            </Alert>
          ) : null}
        </FramePanel>
      </Frame>
      <PermissionPoliciesPanel initialWorkspaceId={workspaceId} />
    </div>
  );
}

const THEME_ICONS: Record<ThemeId, ComponentType<SVGProps<SVGSVGElement>>> = {
  light: SunIcon,
  dark: MoonIcon,
  notebook: NotebookPenIcon,
  debug: BugIcon,
};

const THEME_DESCRIPTIONS: Partial<Record<ThemeId, string>> = {
  notebook: 'Paper, ink and verdigris. Follows your system light or dark setting.',
  debug: 'Development only: every color is red, so anything else skips the theme.',
};

const themeOptions = [
  { value: 'system', label: 'System', icon: MonitorCogIcon },
  ...THEMES.filter((theme) => !theme.development || import.meta.env.DEV).map((theme) => ({
    value: theme.id,
    label: theme.label,
    description: THEME_DESCRIPTIONS[theme.id],
    icon: THEME_ICONS[theme.id],
  })),
];

function AppearanceSettings() {
  const { resolvedTheme, theme, setTheme } = useTheme();
  const {
    conversationWidth,
    interfaceSize,
    motion,
    setConversationWidth,
    setInterfaceSize,
    setMotion,
  } = useAppearancePreferences();
  return (
    <div className="grid gap-6">
      <SectionHeading
        title="Appearance"
        description={`Choose how ${vocab.agent} looks and presents your conversations.`}
      />
      <div>
        <SettingsRow
          title="Theme"
          description={
            theme === 'system' || THEMES.find(({ id }) => id === theme)?.scheme === 'system'
              ? `Following your system, now ${resolvedTheme.dark ? 'dark' : 'light'}.`
              : 'Choose a theme, or follow your system setting.'
          }
        >
          <SettingsChoice
            id="theme"
            label="Theme"
            value={theme}
            onChange={(value) => setTheme(value as ThemePreference)}
            options={themeOptions}
          />
        </SettingsRow>
        <SettingsRow
          title="Interface size"
          description="Enlarge text and controls for comfortable reading on this device."
        >
          <SettingsChoice
            id="interface-size"
            label="Interface size"
            value={String(interfaceSize)}
            onChange={(value) => setInterfaceSize(Number(value) as InterfaceSize)}
            options={[
              { value: '100', label: '100%' },
              { value: '125', label: '125%' },
              { value: '150', label: '150%' },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          title="Conversation width"
          description="Use a focused reading column or give tables and diagrams more room."
        >
          <SettingsChoice
            id="conversation-width"
            label="Conversation width"
            value={conversationWidth}
            onChange={(value) => setConversationWidth(value as ConversationWidth)}
            options={[
              { value: 'focused', label: 'Focused' },
              { value: 'wide', label: 'Wide' },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          title="Motion"
          description="Follow this device's preference or reduce interface animation."
        >
          <SettingsChoice
            id="motion"
            label="Motion"
            value={motion}
            onChange={(value) => setMotion(value as MotionPreference)}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'reduced', label: 'Reduce motion' },
            ]}
          />
        </SettingsRow>
      </div>
    </div>
  );
}

function NotificationSettings() {
  const { attentionSound, desktopNotifications, setAttentionSound, setDesktopNotifications } =
    useNotificationPreferences();
  const updateDesktopNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setDesktopNotifications(false);
      return;
    }
    if (typeof Notification === 'undefined') {
      toast.error('Desktop notifications are not available in this browser');
      return;
    }
    const permission =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== 'granted') {
      toast.error('Desktop notifications were not enabled', {
        description: 'Allow notifications for this app in your browser or operating system.',
      });
      return;
    }
    setDesktopNotifications(true);
  };
  return (
    <div className="grid gap-6">
      <SectionHeading
        title="Notifications"
        description={`Choose how ${vocab.agent} alerts you when a session needs your approval or answer.`}
      />
      <div>
        <SettingsRow
          title="Attention sound"
          description="Play a short chime when a session needs your response."
        >
          <SettingsChoice
            id="attention-sound"
            label="Attention sound"
            value={attentionSound}
            onChange={(value) => setAttentionSound(value as AttentionSoundMode)}
            options={[
              {
                value: 'background',
                label: 'In background',
                description: 'Sound only while this app is not focused.',
              },
              { value: 'always', label: 'Always' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </SettingsRow>
        <SettingsRow title="Test sound" description="Hear the chime used for attention requests.">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void playAttentionSound().then((played) => {
                if (!played) toast.error('This browser could not play the attention sound');
              });
            }}
          >
            <Volume2Icon aria-hidden="true" /> Play test sound
          </Button>
        </SettingsRow>
        <SettingsRow
          title="Desktop notifications"
          htmlFor="desktop-attention-notifications"
          description="Notify when a session needs a response while the app is in the background. Your browser may ask for permission."
        >
          <Switch
            id="desktop-attention-notifications"
            checked={desktopNotifications}
            onCheckedChange={(enabled) => void updateDesktopNotifications(enabled)}
          />
        </SettingsRow>
      </div>
      <p className="text-sm text-muted-foreground">
        The sidebar attention marker stays visible with sound and notifications turned off.
      </p>
    </div>
  );
}

function SettingsSection({
  section,
  sessionId,
  workspaceId,
}: {
  section: string;
  sessionId?: string;
  workspaceId?: string;
}) {
  if (section === 'connections') return <ConnectionsSettings />;
  if (section === 'data-sources') return <DataSourceSettings />;
  if (section === 'session-defaults') return <SessionDefaultsSettings />;
  if (section === 'runtime')
    return (
      <div className="grid gap-10">
        <RuntimeSettingsPanel exclude={['Memory']} />
        <ContextHistorySettings initialSessionId={sessionId} />
      </div>
    );
  if (section === 'fleet') return <FleetSettingsPanel />;
  if (section === 'providers') return <ProvidersSettings />;
  if (section === 'models') return <ModelsSettings />;
  if (section === 'usage') return <UsageSettings />;
  if (section === 'agents') return <AgentSettings />;
  if (section === 'plugins') return <PluginSettings />;
  if (section === 'tools') return <ToolsSettings initialWorkspaceId={workspaceId} />;
  if (section === 'prompts') return <PromptsCommandsSettings initialWorkspaceId={workspaceId} />;
  if (section === 'schedules') return <ScheduleSettings initialSessionId={sessionId} />;
  if (section === 'relays') return <RelaySettings />;
  if (section === 'permissions') return <PermissionsSettings workspaceId={workspaceId} />;
  if (section === 'memory') return <MemorySettings initialSessionId={sessionId} />;
  if (section === 'system') return <SystemSettings />;
  if (section === 'notifications') return <NotificationSettings />;
  if (section === 'general') return <GeneralSettings />;
  if (section === 'about') return <AboutSettings />;
  if (section === 'appearance') return <AppearanceSettings />;
  return <GeneralSettings />;
}

export function SettingsPage() {
  const { section = 'general' } = useParams();
  const location = useLocation();
  const { settings } = useConnectionSettings();
  const destinations = settingsDestinations(inTauri());
  const repository = useRepository();
  const memory = useQuery({
    queryKey: ['memory', 'summary'],
    queryFn: ({ signal }) => repository.memorySummary(signal),
    refetchInterval: 60_000,
    retry: false,
  });
  const inbox = memory.data?.inbox ?? 0;
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    content.current?.scrollTo({ left: 0, top: 0 });
  }, [section]);
  const workspaceRoute = returnRouteFromState(location.state, settings.endpoint);
  const workspaceId = workspaceIdFromRoute(workspaceRoute);
  const sessionId = sessionIdFromRoute(workspaceRoute);
  if (section === 'desktop') {
    return <Navigate replace to={`/settings/general${location.search}`} state={location.state} />;
  }
  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background md:flex-row">
      <SettingsNavigation
        sections={destinations}
        section={section}
        endpoint={settings.endpoint}
        workspaceRoute={workspaceRoute}
        badges={{
          memory: { count: inbox, label: `${inbox} memory changes waiting for review` },
        }}
      />
      <section
        ref={content}
        aria-label="Settings content"
        className="clio-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8"
      >
        <div className="mx-auto max-w-4xl pb-12">
          <SettingsSection
            key={connectionScope(settings)}
            section={section}
            sessionId={sessionId}
            workspaceId={workspaceId}
          />
        </div>
      </section>
    </main>
  );
}
