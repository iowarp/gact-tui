import { brand } from '@brand';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AccessibilityIcon,
  BotIcon,
  BoxesIcon,
  CableIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  KeyRoundIcon,
  InfoIcon,
  MonitorCogIcon,
  Minimize2Icon,
  MoonIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PaletteIcon,
  PlugZapIcon,
  ScrollTextIcon,
  ServerCogIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SunIcon,
  StretchHorizontalIcon,
  Trash2Icon,
  WrenchIcon,
  HeartPulseIcon,
  BrainCircuitIcon,
  CircleAlertIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ClioStatus } from '@/components/clio/status';
import { BlueprintSettings } from '@/components/clio/settings-catalogs';
import { RelaySettings } from '@/components/clio/relay-settings';
import { AgentSettings } from '@/components/clio/settings-agents';
import { ExpertPackSettings } from '@/components/clio/settings-expert-packs';
import { SystemSettings } from '@/components/clio/settings-operations';
import { PermissionPoliciesPanel } from '@/components/clio/settings-permissions';
import { ToolsSettings } from '@/components/clio/settings-tools';
import { ScheduleSettings } from '@/components/clio/settings-schedules';
import { SessionDefaultsSettings } from '@/components/clio/settings-session-defaults';
import { ModelsSettings } from '@/components/clio/settings-models';
import { DesktopSettings } from '@/components/clio/settings-desktop';
import { PromptsCommandsSettings } from '@/components/clio/settings-prompts';
import { MemorySettings } from '@/components/clio/settings-memory';
import { SettingsSectionHeading as SectionHeading } from '@/components/clio/settings-section-heading';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useRepository } from '@/hooks/use-repository';
import { useSwitchConnection } from '@/hooks/use-switch-connection';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  type ConversationWidth,
  type MotionPreference,
  useAppearancePreferences,
} from '@/providers/appearance-provider';
import {
  useConversationDisplay,
  type ConversationDisplayMode,
} from '@/providers/conversation-display-provider';
import {
  returnRouteFromState,
  sessionIdFromRoute,
  workspaceIdFromRoute,
} from '@/lib/workspace-route-memory';
import {
  connectionDegradationLabel,
  materialConnectionDegradations,
} from '@/lib/connection-health';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const sections: Array<{ id: string; label: string; icon: Icon }> = [
  { id: 'connections', label: 'Connections', icon: CableIcon },
  { id: 'session-defaults', label: 'New session defaults', icon: SlidersHorizontalIcon },
  { id: 'providers', label: 'Models', icon: ServerCogIcon },
  { id: 'agents', label: 'Agents', icon: BotIcon },
  { id: 'blueprints', label: 'Marketplaces & blueprints', icon: BoxesIcon },
  { id: 'expert-packs', label: 'Expert packs', icon: PackageIcon },
  { id: 'tools', label: 'Tools & integrations', icon: WrenchIcon },
  { id: 'prompts', label: 'Prompts & commands', icon: ScrollTextIcon },
  { id: 'schedules', label: 'Scheduled work', icon: CalendarClockIcon },
  { id: 'relays', label: 'Remote work', icon: PlugZapIcon },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheckIcon },
  { id: 'memory', label: 'Memory', icon: BrainCircuitIcon },
  { id: 'system', label: 'System', icon: HeartPulseIcon },
  { id: 'appearance', label: 'Appearance', icon: PaletteIcon },
  { id: 'desktop', label: 'Desktop', icon: MonitorCogIcon },
  { id: 'about', label: 'About', icon: InfoIcon },
];

function ConnectionsSettings() {
  const repository = useRepository();
  const { settings, recents, forget } = useConnectionSettings();
  const switchConnection = useSwitchConnection();
  const connectionSwitch = useMutation({
    mutationFn: (connection: (typeof recents)[number]) =>
      switchConnection(connection, { navigateToWorkspace: false }),
  });
  const capabilities = useQuery({
    queryKey: ['capabilities', settings.endpoint],
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  const materialDegradations = materialConnectionDegradations(
    capabilities.data?.degradations ?? [],
  );
  const connectionState = capabilities.isPending
    ? 'connecting'
    : capabilities.isError
      ? 'offline'
      : materialDegradations.length
        ? 'degraded'
        : 'healthy';
  const limitationLabels = materialDegradations.map(connectionDegradationLabel);

  return (
    <div className="grid gap-6">
      <SectionHeading
        description="Choose where your workspace runs and manage addresses you have connected to before."
        title="Connections"
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
                <span>{limitationLabels.join(' ')}</span>
              </div>
            ) : null}
          </div>
          <ClioStatus
            detail={
              capabilities.isError
                ? 'This agent could not be reached.'
                : limitationLabels.join(' ') || undefined
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
        <FrameFooter className="items-start">
          <Button asChild size="sm" variant="outline">
            <Link to="/?intent=connect">Add or test a service</Link>
          </Button>
        </FrameFooter>
      </Frame>
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>Remembered connections</FrameTitle>
          <FrameDescription>
            Use the menu on an address to reconnect or remove it from this device.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-1 p-2">
          {recents.map((connection) => {
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
                      <MoreHorizontalIcon aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={active || connectionSwitch.isPending}
                      onSelect={() => connectionSwitch.mutate(connection)}
                    >
                      <CableIcon aria-hidden="true" /> Connect
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={active}
                      onSelect={() => forget(connection.endpoint)}
                      variant="destructive"
                    >
                      <Trash2Icon aria-hidden="true" /> Forget on this device
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          {recents.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No remembered connections yet.</p>
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
    queryKey: ['permissions', settings.endpoint],
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

function AppearanceSettings() {
  const { resolvedTheme, theme, setTheme } = useTheme();
  const { mode: conversationMode, setMode: setConversationMode } = useConversationDisplay();
  const { conversationWidth, motion, setConversationWidth, setMotion } = useAppearancePreferences();
  return (
    <div className="grid gap-6">
      <SectionHeading
        description="Choose how the workspace looks, moves, and presents conversation activity."
        title="Appearance"
      />
      <PreferenceFrame
        description="System follows the operating system; light and dark use distinct palettes."
        title="Theme"
      >
        <RadioGroup
          className="grid sm:grid-cols-3"
          onValueChange={setTheme}
          value={theme ?? 'system'}
        >
          {[
            { value: 'system', label: 'System', icon: MonitorCogIcon },
            { value: 'dark', label: 'Dark', icon: MoonIcon },
            { value: 'light', label: 'Light', icon: SunIcon },
          ].map(({ value, label, icon: ThemeIcon }) => (
            <FieldLabel htmlFor={`theme-${value}`} key={value}>
              <Field>
                <span className="flex items-center gap-3">
                  <ThemeIcon aria-hidden="true" className="size-5 text-primary" />
                  <FieldContent>
                    <FieldTitle>{label}</FieldTitle>
                    <FieldDescription>
                      {value === 'system' ? `Currently ${resolvedTheme}` : `${label} palette`}
                    </FieldDescription>
                  </FieldContent>
                  <RadioGroupItem id={`theme-${value}`} value={value} />
                </span>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </PreferenceFrame>
      <PreferenceFrame
        description="Choose a focused reading column or let diagrams, tables, and long-form work use more of the available canvas."
        title="Conversation width"
      >
        <RadioGroup
          className="grid gap-3 sm:grid-cols-2"
          onValueChange={(value) => setConversationWidth(value as ConversationWidth)}
          value={conversationWidth}
        >
          {[
            {
              value: 'focused',
              label: 'Focused',
              icon: Minimize2Icon,
              description: 'A comfortable reading width for conversation and code review.',
            },
            {
              value: 'wide',
              label: 'Wide',
              icon: StretchHorizontalIcon,
              description: 'More horizontal room for scientific views, tables, and diagrams.',
            },
          ].map(({ value, label, icon: WidthIcon, description }) => (
            <FieldLabel htmlFor={`conversation-width-${value}`} key={value}>
              <Field className="h-full">
                <span className="flex items-start gap-3">
                  <WidthIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  <FieldContent>
                    <FieldTitle>{label}</FieldTitle>
                    <FieldDescription>{description}</FieldDescription>
                  </FieldContent>
                  <RadioGroupItem id={`conversation-width-${value}`} value={value} />
                </span>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </PreferenceFrame>
      <PreferenceFrame
        description="Keep the operating system preference, or reduce motion explicitly for this workspace. State labels and immediate feedback remain available in both modes."
        title="Motion"
      >
        <RadioGroup
          className="grid gap-3 sm:grid-cols-2"
          onValueChange={(value) => setMotion(value as MotionPreference)}
          value={motion}
        >
          {[
            {
              value: 'system',
              label: 'Follow system',
              icon: MonitorCogIcon,
              description: 'Uses the reduced-motion preference from this device.',
            },
            {
              value: 'reduced',
              label: 'Reduce motion',
              icon: AccessibilityIcon,
              description: 'Removes spatial transitions and indefinite movement in CLIO.',
            },
          ].map(({ value, label, icon: MotionIcon, description }) => (
            <FieldLabel htmlFor={`motion-${value}`} key={value}>
              <Field className="h-full">
                <span className="flex items-start gap-3">
                  <MotionIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  <FieldContent>
                    <FieldTitle>{label}</FieldTitle>
                    <FieldDescription>{description}</FieldDescription>
                  </FieldContent>
                  <RadioGroupItem id={`motion-${value}`} value={value} />
                </span>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </PreferenceFrame>
      <PreferenceFrame
        description="Choose the default level of detail for reasoning and agent work. This changes only presentation; the complete causal record remains available."
        title="Conversation activity"
      >
        <RadioGroup
          className="grid gap-3 sm:grid-cols-2"
          onValueChange={(value) => setConversationMode(value as ConversationDisplayMode)}
          value={conversationMode}
        >
          {[
            {
              value: 'chain',
              label: 'Chain of thought',
              icon: BrainCircuitIcon,
              description:
                'Groups reasoning, updates, tools, and delegated work into an evolving turn. Every chain can open its full activity.',
            },
            {
              value: 'full',
              label: 'Full activity',
              icon: ScrollTextIcon,
              description:
                'Shows each reasoning, text, tool, task, child-agent, UI, and artifact block directly in causal order.',
            },
          ].map(({ value, label, icon: ModeIcon, description }) => (
            <FieldLabel htmlFor={`conversation-mode-${value}`} key={value}>
              <Field className="h-full">
                <span className="flex items-start gap-3">
                  <ModeIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  <FieldContent>
                    <FieldTitle>{label}</FieldTitle>
                    <FieldDescription>{description}</FieldDescription>
                  </FieldContent>
                  <RadioGroupItem id={`conversation-mode-${value}`} value={value} />
                </span>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </PreferenceFrame>
    </div>
  );
}

function PreferenceFrame({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Frame className="gap-3 bg-transparent p-0" spacing="lg" variant="ghost">
      <FrameHeader className="px-0 py-0">
        <FrameTitle>{title}</FrameTitle>
        <FrameDescription>{description}</FrameDescription>
      </FrameHeader>
      <FramePanel className="border-0 bg-transparent p-0 shadow-none before:hidden">
        {children}
      </FramePanel>
    </Frame>
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
  if (section === 'session-defaults') return <SessionDefaultsSettings />;
  if (section === 'providers') return <ModelsSettings />;
  if (section === 'agents') return <AgentSettings />;
  if (section === 'blueprints') return <BlueprintSettings />;
  if (section === 'expert-packs') return <ExpertPackSettings initialWorkspaceId={workspaceId} />;
  if (section === 'tools') return <ToolsSettings initialWorkspaceId={workspaceId} />;
  if (section === 'prompts') return <PromptsCommandsSettings initialWorkspaceId={workspaceId} />;
  if (section === 'schedules') return <ScheduleSettings initialSessionId={sessionId} />;
  if (section === 'relays') return <RelaySettings />;
  if (section === 'permissions') return <PermissionsSettings workspaceId={workspaceId} />;
  if (section === 'memory') return <MemorySettings initialSessionId={sessionId} />;
  if (section === 'system') return <SystemSettings />;
  if (section === 'desktop') return <DesktopSettings />;
  if (section === 'about') return <AboutSettings />;
  return <AppearanceSettings />;
}

function AboutSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const capabilities = useQuery({
    queryKey: ['capabilities', settings.endpoint],
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  const activeModel = capabilities.data?.active_model;
  return (
    <div className="grid gap-6">
      <SectionHeading
        description={`Product identity comes from the active brand profile. Service versions and model identity below are reported by ${new URL(settings.endpoint).host}.`}
        title={`About ${brand.name}`}
      />
      <Frame spacing="sm">
        <FramePanel>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <AboutValue label="Product" value={brand.name} />
            <AboutValue label="Runtime" value={inTauri() ? 'Desktop application' : 'Web browser'} />
            <AboutValue label="Connected service" value={new URL(settings.endpoint).host} />
            <AboutValue
              label="Active model"
              value={
                activeModel
                  ? `${activeModel.provider_id}, ${activeModel.model_id}${activeModel.effort ? `, ${activeModel.effort}` : ''}`
                  : 'Unavailable'
              }
            />
            <AboutValue
              label="Workspace protocol"
              value={capabilities.data?.gact_versions.join(', ') || 'Unavailable'}
            />
            <AboutValue
              label="Interactive views"
              value={capabilities.data?.a2ui_versions.join(', ') || 'Unavailable'}
            />
          </dl>
          {capabilities.error ? (
            <Alert className="mt-4" variant="destructive">
              <AlertTitle>Service details unavailable</AlertTitle>
              <AlertDescription>{capabilities.error.message}</AlertDescription>
            </Alert>
          ) : null}
        </FramePanel>
      </Frame>
      {brand.homeUrl ? (
        <Button asChild className="w-fit" variant="outline">
          <a href={brand.homeUrl} rel="noreferrer" target="_blank">
            Product website
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function AboutValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

export function SettingsPage() {
  const { section = 'appearance' } = useParams();
  const location = useLocation();
  const { settings } = useConnectionSettings();
  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
  }, [section]);
  const workspaceRoute = returnRouteFromState(location.state, settings.endpoint);
  const workspaceId = workspaceIdFromRoute(workspaceRoute);
  const sessionId = sessionIdFromRoute(workspaceRoute);
  return (
    <main className="min-h-dvh bg-background p-4 sm:p-6 lg:p-10">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="grid content-start gap-1 md:sticky md:top-8">
          <Button asChild className="mb-4 justify-start" variant="ghost">
            <Link to={workspaceRoute}>
              <ChevronLeftIcon aria-hidden="true" /> Workspace
            </Link>
          </Button>
          {sections.map(({ id, label, icon: SectionIcon }) => (
            <Button
              asChild
              className="justify-start"
              key={id}
              variant={id === section ? 'secondary' : 'ghost'}
            >
              <Link to={`/settings/${id}`}>
                <SectionIcon aria-hidden="true" /> {label}
              </Link>
            </Button>
          ))}
        </nav>
        <section className="min-w-0 pb-16">
          <SettingsSection section={section} sessionId={sessionId} workspaceId={workspaceId} />
        </section>
      </div>
    </main>
  );
}
