import { deltaWith, pluginReferenceId, emptyAgentDelta, type AgentDelta } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BotIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { useInstalledAgents, usePluginCatalog, useSessionAgent } from '@/hooks/use-session-agent';
import { AddIcon, SaveIcon } from '@/lib/icon-vocabulary';
import { agentDisplayName } from '@/lib/plugin-presentation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AgentPluginMenu } from './agent-plugin-menu';
import { AgentPluginTree } from './agent-plugin-tree';
import { AgentRemovalDialog } from './agent-removal-dialog';
import { ComposedPromptView } from './composed-prompt-view';
import { SaveUserAgentDialog, type SaveUserAgentInput } from './save-user-agent-dialog';

/**
 * The conversation's agent: which plugins it carries and where each came
 * from, the + menu that adds and removes plugins for this conversation, and
 * the composed prompt with every fragment attributed to its plugin.
 */
export function AgentCompositionView({ sessionId }: { sessionId: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const { supported, agent, update } = useSessionAgent(sessionId);
  const catalog = usePluginCatalog();
  const agents = useInstalledAgents();
  const [removing, setRemoving] = useState<string>();
  const [saving, setSaving] = useState(false);
  const resolution = agent.data?.resolution;
  const delta = agent.data?.delta ?? emptyAgentDelta;
  const readOnly = Boolean(agent.data?.subagent);
  const preview = useMutation({
    mutationFn: (plugin: string) =>
      repository.previewPluginRemoval({ ref: resolution!.agent.ref, plugin, delta }),
  });
  const save = useMutation({
    mutationFn: (input: SaveUserAgentInput) =>
      repository.saveUserAgent({
        id: input.id,
        name: input.name,
        description: input.description,
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
  const apply = (next: AgentDelta, success: string) =>
    update.mutate(
      { delta: next },
      {
        onSuccess: () => toast.success(success),
        onSettled: () => setRemoving(undefined),
      },
    );

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
        Loading this conversation&apos;s agent…
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
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <header className="grid gap-3 border-b p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <BotIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
              {resolution.agent.name || resolution.agent.id}
              <span className="font-mono text-xs font-normal text-muted-foreground">
                {resolution.agent.ref}
                {resolution.agent.version ? ` · ${resolution.agent.version}` : ''}
              </span>
            </h2>
            {resolution.agent.role ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{resolution.agent.role}</p>
            ) : null}
            {resolution.agent.kind === 'user' && resolution.agent.parent ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Your agent, starting from {agentDisplayName(resolution.agent.parent, agents.data)}
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
              onAdd={(plugin) =>
                apply(deltaWith(delta, { add: plugin }), `Added ${pluginReferenceId(plugin)}`)
              }
              plugins={catalog.data?.plugins}
              pluginsError={catalog.error?.message}
              resolution={resolution}
            >
              <Button size="sm" variant="outline">
                <AddIcon aria-hidden="true" /> Add plugin
              </Button>
            </AgentPluginMenu>
            <Button
              disabled={!changed || update.isPending}
              onClick={() => setSaving(true)}
              size="sm"
              title={changed ? undefined : 'Add or remove a plugin first'}
              variant="outline"
            >
              <SaveIcon aria-hidden="true" /> Save as agent
            </Button>
            {changed ? (
              <Button
                disabled={update.isPending}
                onClick={() => apply(emptyAgentDelta, `Restored ${parentName}`)}
                size="sm"
                variant="ghost"
              >
                Undo changes
              </Button>
            ) : null}
          </div>
        )}
        {changed ? <DeltaSummary delta={delta} parentName={parentName} /> : null}
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
            onAddBack={(plugin) => apply(deltaWith(delta, { add: plugin }), `Added ${plugin} back`)}
            onRemove={(plugin) => {
              setRemoving(plugin);
              preview.mutate(plugin);
            }}
            pending={update.isPending}
            readOnly={readOnly}
            resolution={resolution}
          />
        </TabsContent>
        <TabsContent value="prompt" className="mt-2">
          <ComposedPromptView resolution={resolution} />
        </TabsContent>
      </Tabs>
      <AgentRemovalDialog
        applying={update.isPending}
        onClose={() => {
          setRemoving(undefined);
          preview.reset();
        }}
        onConfirm={() => {
          if (removing) apply(deltaWith(delta, { remove: removing }), `Removed ${removing}`);
        }}
        plugin={removing}
        preview={preview.data?.plugin === removing ? preview.data : undefined}
        previewError={preview.error?.message}
        previewPending={preview.isPending}
      />
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

function DeltaSummary({ delta, parentName }: { delta: AgentDelta; parentName: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      This conversation changes {parentName}
      {delta.add.length ? `: adds ${delta.add.join(', ')}` : ''}
      {delta.add.length && delta.remove.length ? ';' : delta.remove.length ? ':' : ''}
      {delta.remove.length ? ` removes ${delta.remove.join(', ')}` : ''}.
    </p>
  );
}
