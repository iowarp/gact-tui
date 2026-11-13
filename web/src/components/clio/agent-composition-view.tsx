import {
  deltaWith,
  pluginReferenceId,
  emptyAgentDelta,
  type AgentDelta,
  type AgentResolution,
  type SessionAgent,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useRepository } from '@/hooks/use-repository';
import { useDraftAgentChange, type DraftAgent } from '@/hooks/use-draft-agent-change';
import { usePluginChange, type PluginChange } from '@/hooks/use-plugin-change';
import { useInstalledAgents, usePluginCatalog } from '@/hooks/use-session-agent';
import { agentDisplayName } from '@/lib/plugin-presentation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { AgentPackageItemDetail } from './agent-package-item-detail';
import type { PackageItem } from './agent-package-items';
import { AgentPackages, type AgentPackagesView } from './agent-packages';
import { AgentSwitchMenu } from './agent-switch-menu';
import { AgentTabHeader, AgentUseRows, SaveAsSetupLink } from './agent-tab-overview';
import { AgentRunsWith } from './agent-tab-run-settings';
import { agentUseValues, AGENT_USE_LABELS, type AgentUseKind } from './agent-tab-values';
import { PluginChangeDialog, type PluginChangeDialogProps } from './plugin-change-dialog';
import { KeyValueRowButton, type KeyValueItem } from './primitives/key-value-grid';
import { StateView } from './primitives/state-view';
import { serviceErrorDetail } from './service-error';
import { SettingsGroupLabel } from './settings-row';
import { SaveUserAgentDialog, type SaveUserAgentInput } from './save-user-agent-dialog';

// A row's drill-in (plugin explorer, tool tables) is its own chunk, kept off
// the first load. The panel fetches it on mount so opening a row never waits.
const loadDrillIn = () => import('./agent-tab-drill-in');
const AgentDrillIn = lazy(() => loadDrillIn().then((module) => ({ default: module.AgentDrillIn })));
const PluginExplorer = lazy(() =>
  import('./plugin-explorer').then((module) => ({ default: module.PluginExplorer })),
);

/** What the agent panel reads and changes: a conversation's agent, or a new conversation's draft. */
interface AgentChangeSource {
  supported: boolean | undefined;
  agent: {
    data?: SessionAgent;
    isPending: boolean;
    isFetching?: boolean;
    error: Error | null;
    refetch?: () => unknown;
  };
  update: { isPending: boolean; error: Error | null };
  compact: { isPending: boolean };
  propose: (change: PluginChange) => void;
  dialog: PluginChangeDialogProps;
}

/**
 * The conversation's Agent tab: the setup it runs with (agent, model,
 * reasoning, confirmations) and what it can use (tools, subagents, skills,
 * instructions), each opening the plugins that bring it. Every plugin change
 * goes through the plugin-change warning (`usePluginChange`).
 */
export function AgentCompositionView({ sessionId }: { sessionId: string }) {
  const change = usePluginChange(sessionId);
  const { compact } = change;
  const compactNow = () =>
    compact.mutate(undefined, {
      onSuccess: (result) => {
        if (result.compacted)
          toast.success('Conversation compacted', {
            description: 'The plugin changes are in the agent’s system prompt now.',
          });
        else
          toast.info('Conversation was not compacted', {
            description: result.reason ?? 'The service did not report a reason.',
          });
      },
      onError: (error) =>
        toast.error('Unable to compact this conversation', { description: error.message }),
    });
  return <AgentComposition change={change} onCompact={compactNow} sessionId={sessionId} />;
}

/**
 * A new conversation's agent before its first message: the same panel, on
 * the draft. Changes apply when the first message creates the conversation.
 */
export function DraftAgentCompositionView({
  draft,
  onChange,
  library = false,
  embedded = false,
  naming = false,
}: {
  library?: boolean;
  /** Inside a pane that already scrolls, such as the Settings agent preview. */
  embedded?: boolean;
  /** Open with the save dialog up: a new agent starts as a named variation of this one. */
  naming?: boolean;
  draft: DraftAgent;
  onChange: (next: DraftAgent) => void;
}) {
  const change = useDraftAgentChange(draft, onChange);
  return (
    <AgentComposition
      change={change}
      draft
      embedded={embedded}
      library={library}
      naming={naming}
      onCompact={() => undefined}
    />
  );
}

function AgentComposition({
  change: source,
  draft = false,
  library = false,
  embedded = false,
  naming = false,
  sessionId,
  onCompact,
}: {
  change: AgentChangeSource;
  draft?: boolean;
  library?: boolean;
  embedded?: boolean;
  naming?: boolean;
  sessionId?: string;
  onCompact: () => void;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const { supported, agent, update, compact, propose, dialog } = source;
  const catalog = usePluginCatalog();
  const agents = useInstalledAgents();
  const conversationTitle = useLiveStore((state) =>
    sessionId ? state.entities.sessions[sessionId]?.title : undefined,
  );
  const [saving, setSaving] = useState(naming);
  const [view, setView] = useState<AgentUseKind>();
  const [packagesView, setPackagesView] = useState<AgentPackagesView>({ category: 'all' });
  const [item, setItem] = useState<PackageItem>();
  const [exploring, setExploring] = useState<{ reference: string; skill?: string }>();
  const rows = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void loadDrillIn();
  }, []);
  const resolution = agent.data?.resolution;
  const delta = agent.data?.delta ?? emptyAgentDelta;
  const readOnly = Boolean(agent.data?.subagent);
  const changed = delta.add.length + delta.remove.length > 0;
  // The setup without this conversation's plugin changes, to mark what differs.
  const setup = useQuery({
    queryKey: queryKeys.key('agent-draft', settings.endpoint, resolution?.agent.ref ?? '', '', ''),
    enabled: changed && supported === true && Boolean(resolution),
    queryFn: ({ signal }) =>
      repository.resolveAgent(resolution!.agent.ref, emptyAgentDelta, signal),
  });
  const save = useMutation({
    mutationFn: (input: SaveUserAgentInput) =>
      repository.saveUserAgent({
        id: input.id,
        name: input.name,
        description: input.description,
        create_only: true,
        extends: resolution!.agent.ref,
        add: delta.add,
        remove: delta.remove,
      }),
    onSuccess: async (saved) => {
      setSaving(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.key('agents', settings.endpoint) });
      toast.success(`Saved ${saved.name || saved.ref}`, {
        description: 'Choose it when you start a conversation.',
      });
    },
  });
  const change = (next: AgentDelta, rest: Omit<PluginChange, 'delta'>) =>
    propose({ delta: next, ...rest });
  const add = (plugin: string) => {
    const id = pluginReferenceId(plugin);
    change(deltaWith(delta, { add: plugin }), {
      summary: `Adds ${id} to this conversation.`,
      success: `Added ${id}`,
      failure: `${id} was not added`,
    });
  };
  const remove = (plugin: string) =>
    change(deltaWith(delta, { remove: plugin }), {
      removing: plugin,
      summary: `Removes ${plugin} from this conversation.`,
      success: `Removed ${plugin}`,
      failure: `${plugin} was not removed`,
    });

  if (supported === false) {
    return (
      <StateView
        detail="This service does not compose agents from plugins."
        kind="unavailable"
        title="Agents are not composable here"
      />
    );
  }
  if (agent.isPending) return <StateView kind="loading" title="Loading agent" />;
  if (agent.error || !resolution) {
    return agent.error ? (
      <StateView
        action={
          agent.refetch ? { label: 'Retry', onClick: () => void agent.refetch?.() } : undefined
        }
        detail={serviceErrorDetail(agent.error.message)}
        kind="error"
        title="The agent couldn't be loaded"
      />
    ) : (
      <StateView kind="empty" title="This conversation has no resolved agent" />
    );
  }
  const parentName = agentDisplayName(resolution.agent.ref, agents.data);
  const setupName = resolution.agent.name || resolution.agent.id;
  const values = agentUseValues(resolution, changed ? setup.data : resolution);
  const summary = deltaSummary(delta, draft, library, parentName);
  const setupFacts = [
    `${resolution.agent.ref}${resolution.agent.version ? `, version ${resolution.agent.version}` : ''}`,
    resolution.agent.role,
    resolution.agent.description !== resolution.agent.role ? resolution.agent.description : '',
    resolution.agent.kind === 'user' && resolution.agent.parent
      ? `${library ? 'Based on' : 'Your agent, starting from'} ${agentDisplayName(resolution.agent.parent, agents.data)}`
      : '',
  ]
    .filter(Boolean)
    .join('. ');
  const setupItem: KeyValueItem = {
    label: 'Setup',
    title: setupFacts,
    value:
      library || readOnly ? (
        <span className="min-w-0 truncate">{setupName}</span>
      ) : (
        <AgentSwitchMenu
          agents={agents.data}
          agentsError={agents.error?.message}
          current={resolution.agent.ref}
          disabled={update.isPending}
          onSwitch={(next) => {
            const name = next.name || next.id;
            propose({
              ref: next.ref,
              delta: emptyAgentDelta,
              summary: changed
                ? `Switches this conversation to ${name}, without this conversation’s plugin changes.`
                : `Switches this conversation to ${name}.`,
              success: `Switched to ${name}`,
              failure: `The conversation was not switched to ${name}`,
            });
          }}
        >
          <KeyValueRowButton aria-label={`Setup: ${setupName}`} chevron="down">
            {setupName}
          </KeyValueRowButton>
        </AgentSwitchMenu>
      ),
  };
  const title = library
    ? setupName
    : draft
      ? 'Agent for a new conversation'
      : `Agent for ${conversationTitle || 'this conversation'}`;
  const back = () => {
    const from = view;
    setView(undefined);
    requestAnimationFrame(() =>
      rows.current?.querySelector<HTMLElement>(`[data-agent-use="${from}"]`)?.focus(),
    );
  };
  const backFromItem = () => {
    const from = item;
    setItem(undefined);
    requestAnimationFrame(() =>
      rows.current
        ?.querySelector<HTMLElement>(
          `[data-package-item="${CSS.escape(from?.id ?? '')}"][data-package-category="${from?.category}"]`,
        )
        ?.focus(),
    );
  };
  const packages = (
    <AgentPackages
      delta={delta}
      onAdd={add}
      onExplore={(plugin) => setExploring({ reference: `${plugin.marketplace}/${plugin.id}` })}
      onOpenItem={setItem}
      onRemove={remove}
      onViewChange={setPackagesView}
      pending={update.isPending}
      plugins={catalog.data?.plugins}
      pluginsError={catalog.error?.message}
      readOnly={readOnly}
      resolution={resolution}
      view={packagesView}
    />
  );
  return (
    <div
      className={
        embedded
          ? // A detail pane already pads its body; the rows' own gutters would inset twice.
            '@container/agent-tab -mx-3.5 flex min-w-0 flex-col'
          : 'clio-scrollbar @container/agent-tab flex h-full min-h-0 min-w-0 flex-col overflow-y-auto'
      }
      data-slot="agent-tab"
      ref={rows}
    >
      {/* In a library pane the header holds only the legend: it shows once something changed. */}
      {library && embedded && !(changed && !readOnly) ? null : (
        <AgentTabHeader
          className={library && !embedded ? 'pr-12' : undefined}
          reset={
            changed && !readOnly
              ? {
                  label: 'Reset to setup',
                  description: summary,
                  disabled: update.isPending,
                  onReset: () =>
                    change(emptyAgentDelta, {
                      summary: `Restores ${parentName}’s plugins in this conversation.`,
                      success: `Restored ${parentName}`,
                      failure: `${parentName} was not restored`,
                    }),
                }
              : undefined
          }
          title={title}
          legend={!embedded || changed}
          titleShown={!embedded}
        />
      )}
      {library && !view && !item ? packages : null}
      {library && !view && !item ? <AgentUseRows onOpen={setView} values={values} /> : null}
      {changed ? (
        <p className="truncate px-3.5 pb-2 text-meta text-muted-foreground" title={summary}>
          {summary}
        </p>
      ) : null}
      {readOnly ? (
        <p
          className="truncate px-3.5 pb-2 text-meta text-muted-foreground"
          title="This conversation runs a defined subagent. Its plugins follow the conversation that started it."
        >
          This conversation runs a defined subagent. Its plugins follow the conversation that
          started it.
        </p>
      ) : null}
      {update.error ? (
        <Alert className="mx-3.5 mb-2 w-auto" variant="destructive">
          <AlertTitle>The agent was not changed</AlertTitle>
          <AlertDescription>{update.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {item ? (
        <AgentPackageItemDetail
          backLabel={
            view
              ? `Back to ${AGENT_USE_LABELS[view]}`
              : library
                ? 'Back to packages'
                : 'Back to the agent'
          }
          item={item}
          onBack={backFromItem}
          onExplore={(target, skill) => {
            const plugin = resolution.plugins.find((entry) => entry.id === target.plugin);
            if (!plugin) return;
            setExploring({
              reference: `${plugin.marketplace}/${plugin.id}`,
              skill: skill ? target.id : undefined,
            });
          }}
          resolution={resolution}
        />
      ) : view ? (
        <Suspense fallback={null}>
          <AgentDrillIn
            basis={agent.data?.prompt_basis}
            compacting={compact.isPending}
            delta={delta}
            kind={view}
            onAdd={add}
            onAddBack={(plugin) =>
              change(deltaWith(delta, { add: plugin }), {
                summary: `Adds ${plugin} back to this conversation.`,
                success: `Added ${plugin} back`,
                failure: `${plugin} was not added back`,
              })
            }
            onBack={back}
            onCompact={onCompact}
            onOpenItem={setItem}
            onRemove={remove}
            pending={update.isPending}
            plugins={catalog.data?.plugins}
            pluginsError={catalog.error?.message}
            readOnly={readOnly}
            resolution={resolution}
            value={values[view].text}
          />
        </Suspense>
      ) : (
        <>
          <AgentRunsWith
            mode={library ? 'library' : draft ? 'draft' : 'session'}
            sessionId={sessionId}
            setup={setupItem}
          />
          {library ? null : <AgentUseRows onOpen={setView} values={values} />}
          {library ? null : packages}
          {library ? <AgentAbout facts={setupFacts} resolution={resolution} /> : null}
          {readOnly ? null : (
            <SaveAsSetupLink
              disabled={(!changed && !library) || update.isPending || Boolean(agent.isFetching)}
              disabledReason="Add or remove a plugin first"
              label={library ? 'Save local variation' : 'Save as a setup…'}
              onSave={() => setSaving(true)}
            />
          )}
        </>
      )}
      <PluginChangeDialog {...dialog} />
      {exploring ? (
        <Suspense fallback={null}>
          <PluginExplorer
            initialSkill={exploring.skill}
            onClose={() => setExploring(undefined)}
            reference={exploring.reference}
          />
        </Suspense>
      ) : null}
      {saving ? (
        <SaveUserAgentDialog
          delta={delta}
          error={save.error?.message}
          onClose={() => setSaving(false)}
          onSave={(input) => save.mutate(input)}
          open
          parentName={parentName}
          parentRef={resolution.agent.ref}
          pending={save.isPending}
        />
      ) : null}
    </div>
  );
}

/** What the agent is for, in its own words, plus where it comes from. */
function AgentAbout({ resolution, facts }: { resolution: AgentResolution; facts: string }) {
  const { role, description } = resolution.agent;
  return (
    <section aria-label="About this agent" className="grid min-w-0 gap-1.5 px-3.5 pt-1 pb-2">
      <SettingsGroupLabel className="mt-1">About</SettingsGroupLabel>
      <div className="grid gap-2 text-meta leading-5">
        {role ? <p>{role}</p> : null}
        {description && description !== role ? <p>{description}</p> : null}
        <p className="break-words text-muted-foreground">{facts}</p>
      </div>
    </section>
  );
}

/** In words, how this agent differs from the setup it starts from. */
function deltaSummary(
  delta: AgentDelta,
  draft: boolean,
  library: boolean,
  parentName: string,
): string {
  const lead = library
    ? 'This local variation changes'
    : draft
      ? 'This new conversation will change'
      : 'This conversation changes';
  const adds = delta.add.length ? `: adds ${delta.add.join(', ')}` : '';
  const joiner = delta.add.length && delta.remove.length ? ';' : delta.remove.length ? ':' : '';
  const removes = delta.remove.length ? ` removes ${delta.remove.join(', ')}` : '';
  return `${lead} ${parentName}${adds}${joiner}${removes}.`;
}
