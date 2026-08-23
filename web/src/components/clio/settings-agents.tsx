import type { AgentDefinition, ToolCatalogItem } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BotIcon, MoreHorizontalIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioInteractiveRow } from './interactive-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioStatus } from './status';
import { humanizeToolName } from './tool-presentation';

export function AgentSettings() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [editing, setEditing] = useState<AgentDefinition | null>();
  const [deleting, setDeleting] = useState<AgentDefinition>();
  const agents = useQuery({
    queryKey: ['agents', settings.endpoint],
    queryFn: ({ signal }) => repository.agents(signal),
  });
  const tools = useQuery({
    queryKey: ['tools', settings.endpoint],
    queryFn: ({ signal }) => repository.tools(signal),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['agents', settings.endpoint] });
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
        <AgentEditor
          agent={editing}
          error={save.error?.message}
          key={editing?.id ?? 'new-agent'}
          onClose={() => setEditing(undefined)}
          onSave={save.mutateAsync}
          pending={save.isPending}
          tools={tools.data ?? []}
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
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>Edit agent</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDelete} variant="destructive">
                <Trash2Icon aria-hidden="true" /> Remove agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Badge variant="outline">Built in</Badge>
        )
      }
    >
      <div className="flex items-start gap-3">
        <BotIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{agent.title}</p>
            <ClioStatus value={agent.enabled ? 'healthy' : 'degraded'} />
            <Badge variant="outline">{agent.source.replaceAll('_', ' ')}</Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {agent.description || 'No description provided.'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {agent.tools.length} tools, {agent.skills.length} skills, {tierLabel(agent.tier)}
            {agent.default_model ? `, ${agent.default_model}` : ''}
          </p>
        </div>
      </div>
    </ClioInteractiveRow>
  );
}

interface AgentDraft {
  id: string;
  title: string;
  description: string;
  systemPrompt: string;
  provider: string;
  model: string;
  tier: string;
  specialization: string;
  keywords: string;
  skills: string;
  commands: string;
  tools: string[];
}

function AgentEditor({
  agent,
  error,
  onClose,
  onSave,
  pending,
  tools,
}: {
  agent: AgentDefinition | null;
  error?: string;
  onClose: () => void;
  onSave: (agent: AgentDefinition) => Promise<unknown>;
  pending?: boolean;
  tools: readonly ToolCatalogItem[];
}) {
  const [draft, setDraft] = useState<AgentDraft>(() => draftFrom(agent));
  const update = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const valid = Boolean(
    draft.id.trim() && draft.title.trim() && (agent || draft.systemPrompt.trim()),
  );
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{agent ? `Edit ${agent.title}` : 'Create an agent'}</DialogTitle>
          <DialogDescription>
            Define what the agent is responsible for and which service-owned capabilities it may
            use.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                disabled={Boolean(agent)}
                label="Identifier"
                onChange={(v) => update('id', v)}
                value={draft.id}
              />
              <TextField
                label="Display name"
                onChange={(v) => update('title', v)}
                value={draft.title}
              />
            </div>
            <TextField
              label="Description"
              onChange={(v) => update('description', v)}
              value={draft.description}
            />
            <Field>
              <FieldLabel htmlFor="agent-system-prompt">Agent instructions</FieldLabel>
              <Textarea
                id="agent-system-prompt"
                onChange={(event) => update('systemPrompt', event.target.value)}
                rows={7}
                value={draft.systemPrompt}
              />
              <FieldDescription>
                These instructions define the agent's role. They are not a user message.
              </FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel>Responsibility</FieldLabel>
                <Select onValueChange={(value) => update('tier', value)} value={draft.tier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Coordinator</SelectItem>
                    <SelectItem value="2">Specialist</SelectItem>
                    <SelectItem value="3">Focused worker</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <TextField
                label="Provider"
                onChange={(v) => update('provider', v)}
                value={draft.provider}
              />
              <TextField label="Model" onChange={(v) => update('model', v)} value={draft.model} />
            </div>
            <TextField
              label="Specialization"
              onChange={(v) => update('specialization', v)}
              value={draft.specialization}
            />
            <TextField
              label="Keywords"
              onChange={(v) => update('keywords', v)}
              value={draft.keywords}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Skills"
                onChange={(v) => update('skills', v)}
                value={draft.skills}
              />
              <TextField
                label="Commands"
                onChange={(v) => update('commands', v)}
                value={draft.commands}
              />
            </div>
            <Field>
              <FieldLabel>Tools</FieldLabel>
              <Command className="rounded-lg border">
                <CommandInput placeholder="Search available tools" />
                <CommandList className="max-h-52">
                  <CommandEmpty>No matching tool.</CommandEmpty>
                  <CommandGroup>
                    {tools.map((tool) => {
                      const id = tool.name || tool.id;
                      const title = tool.title || humanizeToolName(id);
                      const checked = draft.tools.includes(id);
                      return (
                        <CommandItem
                          key={`${tool.server_id}:${id}`}
                          onSelect={() =>
                            update(
                              'tools',
                              checked
                                ? draft.tools.filter((item) => item !== id)
                                : [...draft.tools, id],
                            )
                          }
                          value={`${title} ${tool.description ?? ''} ${id}`}
                        >
                          <Checkbox checked={checked} tabIndex={-1} />
                          <span className="min-w-0 flex-1 truncate">{title}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{id}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </Field>
          </FieldGroup>
        </ScrollArea>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Agent was not saved</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!valid || pending}
            onClick={() => void onSave(agentFromDraft(agent, draft))}
          >
            {pending ? 'Saving…' : 'Save agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = `agent-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </Field>
  );
}

function draftFrom(agent: AgentDefinition | null): AgentDraft {
  return {
    id: agent?.id ?? '',
    title: agent?.title ?? '',
    description: agent?.description ?? '',
    systemPrompt: agent?.system_prompt ?? '',
    provider: agent?.default_provider ?? '',
    model: agent?.default_model ?? '',
    tier: String(agent?.tier || 2),
    specialization: agent?.specialization ?? '',
    keywords: (agent?.keywords ?? []).join(', '),
    skills: (agent?.skills ?? []).join(', '),
    commands: (agent?.commands ?? []).join(', '),
    tools: [...(agent?.tools ?? [])],
  };
}

function agentFromDraft(previous: AgentDefinition | null, draft: AgentDraft): AgentDefinition {
  const base = previous ?? emptyAgentDefinition();
  return {
    ...base,
    id: draft.id.trim(),
    title: draft.title.trim(),
    description: draft.description.trim(),
    source: 'user',
    system_prompt: draft.systemPrompt.trim(),
    default_provider: draft.provider.trim(),
    default_model: draft.model.trim(),
    tier: Number(draft.tier),
    specialization: draft.specialization.trim(),
    keywords: list(draft.keywords),
    skills: list(draft.skills),
    commands: list(draft.commands),
    tools: draft.tools,
  };
}

function emptyAgentDefinition(): AgentDefinition {
  return {
    id: '',
    title: '',
    description: '',
    source: 'user',
    enabled: true,
    validation_errors: [],
    parent_id: '',
    system_prompt: '',
    prompt_id: '',
    prompt_profile: '',
    default_provider: '',
    default_model: '',
    api_base: '',
    credential_ref: '',
    transport: '',
    parameters: {},
    module: {},
    signature: {},
    structured_outputs: {},
    fanout: {},
    tools: [],
    skills: [],
    commands: [],
    capability_refs: [],
    metadata: {},
    tier: 2,
    specialization: '',
    keywords: [],
  };
}

function list(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function tierLabel(tier: number): string {
  if (tier === 0) return 'General agent';
  if (tier === 1) return 'Coordinator';
  if (tier === 3) return 'Focused worker';
  return 'Specialist';
}
