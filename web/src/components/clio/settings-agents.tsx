import { queryKeys } from '@/lib/query-keys';
import type { AgentDefinition } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BotIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  WrenchIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { useRepository } from '@/hooks/use-repository';
import { providerDisplayName, providerLogoId } from '@/lib/provider-presentation';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AgentEditorDialog } from './agent-editor-dialog';
import { ClioInteractiveRow } from './interactive-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioStatus } from './status';

export function AgentSettings() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [editing, setEditing] = useState<AgentDefinition | null>();
  const [deleting, setDeleting] = useState<AgentDefinition>();
  const agents = useQuery({
    queryKey: queryKeys.key('agents', settings.endpoint),
    queryFn: ({ signal }) => repository.agents(signal),
  });
  const tools = useQuery({
    queryKey: queryKeys.key('tools', settings.endpoint),
    queryFn: ({ signal }) => repository.tools(signal),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.key('agents', settings.endpoint) });
  const save = useMutation({
    mutationFn: (agent: AgentDefinition) =>
      editing ? repository.updateAgent(editing.id, agent) : repository.createAgent(agent),
    onSuccess: async (agent) => {
      setEditing(undefined);
      await invalidate();
      toast.success(`${agent.title} saved`);
    },
  });
  const remove = useMutation({
    mutationFn: (agent: AgentDefinition) => repository.deleteAgent(agent.id),
    onSuccess: async (_value, agent) => {
      setDeleting(undefined);
      await invalidate();
      toast.success(`${agent.title} removed`);
    },
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SettingsSectionHeading
          description="Manage the agents this service can route work to. Built-in agents are visible but immutable; user agents keep their execution instructions and capability bindings."
          title="Agents"
        />
        <Button onClick={() => setEditing(null)}>
          <PlusIcon aria-hidden="true" /> New agent
        </Button>
      </div>
      {agents.error ? (
        <Alert variant="destructive">
          <AlertTitle>Agent registry unavailable</AlertTitle>
          <AlertDescription>{agents.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-2">
        {agents.data?.map((agent) => (
          <AgentRow
            agent={agent}
            key={agent.id}
            onDelete={() => setDeleting(agent)}
            onEdit={() => setEditing(agent)}
          />
        ))}
      </div>

      {editing !== undefined ? (
        <AgentEditorDialog
          agent={editing}
          error={save.error?.message}
          key={editing?.id ?? 'new-agent'}
          onClose={() => setEditing(undefined)}
          onSave={save.mutateAsync}
          pending={save.isPending}
          tools={tools.data ?? []}
          toolsError={tools.error?.message}
          toolsPending={tools.isPending}
        />
      ) : null}

      <AlertDialog
        onOpenChange={(open) => !open && setDeleting(undefined)}
        open={Boolean(deleting)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent definition will be removed from future routing. Existing session history is
              preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.error ? (
            <Alert variant="destructive">
              <AlertTitle>Agent was not removed</AlertTitle>
              <AlertDescription>{remove.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep agent</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting)}
              variant="destructive"
            >
              Remove agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AgentRow({
  agent,
  onDelete,
  onEdit,
}: {
  agent: AgentDefinition;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const editable = agent.source === 'user';
  const invalid = agent.validation_errors.length > 0;
  const status = invalid ? 'unavailable' : agent.enabled ? 'healthy' : 'degraded';
  const statusLabel = invalid ? 'Needs attention' : agent.enabled ? 'Available' : 'Disabled';
  const description = agentDescription(agent);
  const providerName = agent.default_provider
    ? providerDisplayName(undefined, agent.default_provider)
    : undefined;
  return (
    <ClioInteractiveRow
      actions={
        editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label={`Actions for ${agent.title}`} size="icon-sm" variant="ghost">
                <MoreHorizontalIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onSelect={onEdit}>Edit agent</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDelete} variant="destructive">
                <Trash2Icon aria-hidden="true" /> Remove agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      }
    >
      <div className="flex items-start gap-3">
        <BotIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{agent.title}</p>
            <ClioStatus
              detail={invalid ? agent.validation_errors.join(' ') : undefined}
              label={statusLabel}
              value={status}
            />
            <Badge variant="outline">{editable ? 'Custom' : 'Built in'}</Badge>
          </div>
          <p
            className="mt-1 text-sm leading-6 text-muted-foreground"
            title={description === agent.description ? undefined : agent.description}
          >
            {description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <WrenchIcon aria-hidden="true" className="size-3.5" />
              {agent.tools.length} {agent.tools.length === 1 ? 'tool' : 'tools'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <SparklesIcon aria-hidden="true" className="size-3.5" />
              {agent.skills.length ? `${agent.skills.length} skills` : 'No skills'}
            </span>
            <Badge variant="secondary">{tierLabel(agent.tier)}</Badge>
            {agent.default_model ? (
              <Badge className="gap-1.5" title={providerName} variant="outline">
                {agent.default_provider ? (
                  <ModelSelectorLogo provider={providerLogoId(agent.default_provider)} />
                ) : null}
                <span>{providerName}</span>
                <span className="text-muted-foreground">{agent.default_model}</span>
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </ClioInteractiveRow>
  );
}

function agentDescription(agent: AgentDefinition): string {
  if (agent.source === 'builtin' && agent.id === 'main') {
    return 'Coordinates sessions that do not use a domain blueprint.';
  }
  return agent.description || 'No description provided.';
}

function tierLabel(tier: number): string {
  if (tier === 0) return 'General agent';
  if (tier === 1) return 'Coordinator';
  if (tier === 3) return 'Focused worker';
  return 'Specialist';
}
