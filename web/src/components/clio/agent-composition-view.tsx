import {
  deltaWith,
  pluginReferenceId,
  emptyAgentDelta,
  type AgentDelta,
  type SessionAgent,
} from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BotIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { useDraftAgentChange, type DraftAgent } from '@/hooks/use-draft-agent-change';
import { usePluginChange, type PluginChange } from '@/hooks/use-plugin-change';
import { useInstalledAgents, usePluginCatalog } from '@/hooks/use-session-agent';
import { AddIcon, SaveIcon } from '@/lib/icon-vocabulary';
import { agentDisplayName } from '@/lib/plugin-presentation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AgentPluginMenu } from './agent-plugin-menu';
import { AgentPluginTree } from './agent-plugin-tree';
import { AgentSwitchMenu } from './agent-switch-menu';
import { ComposedPromptView } from './composed-prompt-view';
import { PluginChangeDialog, type PluginChangeDialogProps } from './plugin-change-dialog';
import { SaveUserAgentDialog, type SaveUserAgentInput } from './save-user-agent-dialog';

/** What the agent panel reads and changes: a conversation's agent, or a new conversation's draft. */
interface AgentChangeSource {
  supported: boolean | undefined;
  agent: { data?: SessionAgent; isPending: boolean; isFetching?: boolean; error: Error | null };
  update: { isPending: boolean; error: Error | null };
  compact: { isPending: boolean };
  propose: (change: PluginChange) => void;
  dialog: PluginChangeDialogProps;
}

/**
 * The conversation's agent: which plugins it carries and where each came
 * from, the + menu that adds and removes plugins for this conversation, and
 * the composed prompt with every fragment attributed to its plugin. Every
 * change goes through the plugin-change warning (`usePluginChange`).
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
  return <AgentComposition change={change} onCompact={compactNow} />;
}

/**
 * A new conversation's agent before its first message: the same panel, on
 * the draft. Changes apply when the first message creates the conversation.
 */
export function DraftAgentCompositionView({
  draft,
  onChange,
  library = false,
}: {
  library?: boolean;
  draft: DraftAgent;
  onChange: (next: DraftAgent) => void;
}) {
  const change = useDraftAgentChange(draft, onChange);
  return <AgentComposition change={change} draft library={library} onCompact={() => undefined} />;
}

function AgentComposition({
  change: source,
  draft = false,
  library = false,
  onCompact,
}: {
  change: AgentChangeSource;
  draft?: boolean;
  library?: boolean;
  onCompact: () => void;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const { supported, agent, update, compact, propose, dialog } = source;
  const catalog = usePluginCatalog();
  const agents = useInstalledAgents();
  const [saving, setSaving] = useState(false);
  const resolution = agent.data?.resolution;
  const delta = agent.data?.delta ?? emptyAgentDelta;
  const readOnly = Boolean(agent.data?.subagent);
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

  if (supported === false) {
    return (
      <Alert className="m-4 w-auto">
        <AlertTitle>Agents are not composable here</AlertTitle>
        <AlertDescription>
          This service does not compose agents from plugins, so the conversation&apos;s plugins
          cannot be shown or changed.
        </AlertDescription>
      </Alert>
    );
  }
  if (agent.isPending) {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        Loading agent…
      </p>
    );
  }
  if (agent.error || !resolution) {
    return (
      <Alert className="m-4 w-auto" variant="destructive">
        <AlertTitle>Agent unavailable</AlertTitle>
        <AlertDescription>
          {agent.error?.message ?? 'The conversation has no resolved agent.'}
        </AlertDescription>
      </Alert>
    );
  }
  const parentName = agentDisplayName(resolution.agent.ref, agents.data);
  const changed = delta.add.length + delta.remove.length > 0;
  return (
    <div className="clio-scrollbar flex h-full min-h-0 min-w-0 flex-col overflow-y-auto">
      <header className={library ? 'grid gap-3 border-b p-4 pr-12' : 'grid gap-3 border-b p-4'}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <BotIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
              {resolution.agent.name || resolution.agent.id}
              {!library ? (
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  {resolution.agent.ref}
                  {resolution.agent.version ? `, version ${resolution.agent.version}` : ''}
                </span>
              ) : null}
            </h2>
            {resolution.agent.role ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{resolution.agent.role}</p>
            ) : null}
            {library ? (
              <details className="mt-1 text-sm">
                <summary className="w-fit cursor-pointer text-muted-foreground">
                  About this agent
                </summary>
                <div className="mt-2 grid gap-2 leading-6">
                  {resolution.agent.description &&
                  resolution.agent.description !== resolution.agent.role ? (
                    <p>{resolution.agent.description}</p>
                  ) : null}
                  <p className="break-words text-xs text-muted-foreground">
                    {resolution.agent.ref}
                    {resolution.agent.version ? `, version ${resolution.agent.version}` : ''}
                  </p>
                </div>
              </details>
            ) : (
              <>
                {resolution.agent.description &&
                resolution.agent.description !== resolution.agent.role ? (
                  <p className="mt-1 text-sm">{resolution.agent.description}</p>
                ) : null}
              </>
            )}
            {resolution.agent.kind === 'user' && resolution.agent.parent ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {library ? 'Based on' : 'Your agent, starting from'}{' '}
                {agentDisplayName(resolution.agent.parent, agents.data)}
              </p>
            ) : null}
          </div>
        </div>
        {readOnly ? (
          <p className="text-sm text-muted-foreground">
            This conversation runs a defined subagent. Its plugins follow the conversation that
            started it.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <AgentPluginMenu
              delta={delta}
              disabled={update.isPending}
              onAdd={(plugin) => {
                const id = pluginReferenceId(plugin);
                change(deltaWith(delta, { add: plugin }), {
                  summary: `Adds ${id} to this conversation.`,
                  success: `Added ${id}`,
                  failure: `${id} was not added`,
                });
              }}
              plugins={catalog.data?.plugins}
              pluginsError={catalog.error?.message}
              resolution={resolution}
            >
              <Button size="sm" variant="outline">
                <AddIcon aria-hidden="true" /> Add plugin
              </Button>
            </AgentPluginMenu>
            {!library ? (
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
                <Button size="sm" variant="outline">
                  <BotIcon aria-hidden="true" /> Switch agent
                </Button>
              </AgentSwitchMenu>
            ) : null}
            <Button
              disabled={(!changed && !library) || update.isPending || agent.isFetching}
              onClick={() => setSaving(true)}
              size="sm"
              title={changed || library ? undefined : 'Add or remove a plugin first'}
              variant="outline"
            >
              <SaveIcon aria-hidden="true" /> {library ? 'Save local variation' : 'Save as agent'}
            </Button>
            {changed ? (
              <Button
                disabled={update.isPending}
                onClick={() =>
                  change(emptyAgentDelta, {
                    summary: `Restores ${parentName}’s plugins in this conversation.`,
                    success: `Restored ${parentName}`,
                    failure: `${parentName} was not restored`,
                  })
                }
                size="sm"
                variant="ghost"
              >
                Undo changes
              </Button>
            ) : null}
          </div>
        )}
        {changed ? (
          <DeltaSummary delta={delta} draft={draft} library={library} parentName={parentName} />
        ) : null}
        {update.error ? (
          <Alert variant="destructive">
            <AlertTitle>The agent was not changed</AlertTitle>
            <AlertDescription>{update.error.message}</AlertDescription>
          </Alert>
        ) : null}
      </header>
      <Tabs className="min-h-0 flex-1 p-4" defaultValue="plugins">
        <TabsList>
          <TabsTrigger value="plugins">Plugins ({resolution.plugins.length})</TabsTrigger>
          <TabsTrigger value="prompt">Prompt</TabsTrigger>
        </TabsList>
        <TabsContent value="plugins" className="mt-2">
          <AgentPluginTree
            delta={delta}
            basis={agent.data?.prompt_basis}
            compacting={compact.isPending}
            onAddBack={(plugin) =>
              change(deltaWith(delta, { add: plugin }), {
                summary: `Adds ${plugin} back to this conversation.`,
                success: `Added ${plugin} back`,
                failure: `${plugin} was not added back`,
              })
            }
            onCompact={onCompact}
            onRemove={(plugin) =>
              change(deltaWith(delta, { remove: plugin }), {
                removing: plugin,
                summary: `Removes ${plugin} from this conversation.`,
                success: `Removed ${plugin}`,
                failure: `${plugin} was not removed`,
              })
            }
            pending={update.isPending}
            readOnly={readOnly}
            resolution={resolution}
          />
        </TabsContent>
        <TabsContent value="prompt" className="mt-2">
          <ComposedPromptView resolution={resolution} />
        </TabsContent>
      </Tabs>
      <PluginChangeDialog {...dialog} />
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

function DeltaSummary({
  delta,
  draft,
  library = false,
  parentName,
}: {
  library?: boolean;
  delta: AgentDelta;
  draft: boolean;
  parentName: string;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {library
        ? 'This local variation changes'
        : draft
          ? 'This new conversation will change'
          : 'This conversation changes'}{' '}
      {parentName}
      {delta.add.length ? `: adds ${delta.add.join(', ')}` : ''}
      {delta.add.length && delta.remove.length ? ';' : delta.remove.length ? ':' : ''}
      {delta.remove.length ? ` removes ${delta.remove.join(', ')}` : ''}.
    </p>
  );
}
