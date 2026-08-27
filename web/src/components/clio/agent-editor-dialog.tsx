import { queryKeys } from '@/lib/query-keys';
import type { AgentDefinition, ToolCatalogItem } from '@clio/core/v3';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, Settings2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { buildModelOptions } from '@/lib/model-options';
import { providerDisplayName, providerLogoId } from '@/lib/provider-presentation';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioModelPicker } from './model-picker';
import { humanizeToolName } from './tool-presentation';

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

interface AgentEditorDialogProps {
  agent: AgentDefinition | null;
  error?: string;
  onClose: () => void;
  onSave: (agent: AgentDefinition) => Promise<unknown>;
  pending?: boolean;
  tools: readonly ToolCatalogItem[];
  toolsError?: string;
  toolsPending?: boolean;
}

/** Edit a service-owned agent definition without exposing adapter fields by default. */
export function AgentEditorDialog({
  agent,
  error,
  onClose,
  onSave,
  pending,
  tools,
  toolsError,
  toolsPending,
}: AgentEditorDialogProps) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [draft, setDraft] = useState<AgentDraft>(() => draftFrom(agent));
  const [customSource, setCustomSource] = useState(false);
  const formViewportRef = useRef<HTMLDivElement>(null);
  const update = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const modelConfiguration = useQuery({
    queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });
  const configuredPreset = modelConfiguration.data?.presets.find(
    (preset) =>
      preset.id === modelConfiguration.data?.provider ||
      preset.provider === modelConfiguration.data?.provider,
  );
  const effectiveProvider =
    draft.provider || configuredPreset?.id || modelConfiguration.data?.provider || '';
  const effectiveModel =
    draft.model || (!draft.provider ? modelConfiguration.data?.model : '') || '';
  const selectedPreset = modelConfiguration.data?.presets.find(
    (preset) => preset.id === effectiveProvider || preset.provider === effectiveProvider,
  );
  const catalogProvider = selectedPreset?.id ?? effectiveProvider;
  const authenticatedPresets =
    modelConfiguration.data?.presets.filter((preset) => preset.is_authenticated) ?? [];
  const modelCatalogs = useQueries({
    queries: authenticatedPresets.map((preset) => ({
      queryKey: queryKeys.key('provider-models', settings.endpoint, preset.id),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        repository.providerModels(preset.id, signal),
    })),
  });
  const catalogModelsByProvider = Object.fromEntries(
    authenticatedPresets.map((preset, index) => [preset.id, modelCatalogs[index]?.data?.models]),
  );
  const selectedCatalogError =
    modelCatalogs[authenticatedPresets.findIndex((preset) => preset.id === selectedPreset?.id)]
      ?.error;
  const modelOptions = buildModelOptions({
    activeCatalogProvider: catalogProvider,
    activeModel: effectiveModel,
    activeProvider: effectiveProvider,
    catalogModelsByProvider,
    presets: modelConfiguration.data?.presets ?? [],
  });
  const selectedChoice = modelOptions.find(
    (choice) => choice.providerId === effectiveProvider && choice.id === effectiveModel,
  );

  const valid = Boolean(
    draft.id.trim() && draft.title.trim() && (agent || draft.systemPrompt.trim()),
  );

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent
        className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => {
            if (formViewportRef.current) formViewportRef.current.scrollTop = 0;
            document.getElementById('agent-identifier')?.focus({ preventScroll: true });
            if (formViewportRef.current) formViewportRef.current.scrollTop = 0;
          });
        }}
      >
        <DialogHeader>
          <DialogTitle>{agent ? `Edit ${agent.title}` : 'Create an agent'}</DialogTitle>
          <DialogDescription>
            Define its responsibility, preferred model, and service-owned capabilities.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-4" ref={formViewportRef}>
          <FieldGroup className="pb-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                disabled={Boolean(agent)}
                label="Identifier"
                onChange={(value) => update('id', value)}
                value={draft.id}
              />
              <TextField
                id="agent-display-name"
                label="Display name"
                onChange={(value) => update('title', value)}
                value={draft.title}
              />
            </div>
            <TextField
              label="Description"
              onChange={(value) => update('description', value)}
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
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field>
                <FieldLabel>Preferred model</FieldLabel>
                <ClioModelPicker
                  model={effectiveModel}
                  onChange={(choice) => {
                    setDraft((current) => ({
                      ...current,
                      provider: choice.providerId,
                      model: choice.id,
                    }));
                    setCustomSource(false);
                  }}
                  options={modelOptions}
                  provider={effectiveProvider}
                  trigger={
                    <Button
                      aria-label="Preferred model"
                      className="w-full justify-between font-normal"
                      variant="outline"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {effectiveProvider ? (
                          <ModelSelectorLogo provider={providerLogoId(effectiveProvider)} />
                        ) : null}
                        <span className="truncate">
                          {selectedChoice?.label || effectiveModel || 'Choose a model'}
                        </span>
                      </span>
                      <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 opacity-60" />
                    </Button>
                  }
                />
                <FieldDescription>
                  {selectedCatalogError
                    ? 'Live choices for this provider are unavailable. The current selection remains usable.'
                    : selectedPreset
                      ? `${providerDisplayName(selectedPreset)} models are reported by the connected agent.`
                      : 'Choose from models reported by the connected agent.'}
                </FieldDescription>
              </Field>
            </div>
            <Collapsible onOpenChange={setCustomSource} open={customSource}>
              <CollapsibleTrigger asChild>
                <Button className="px-0" size="sm" variant="link">
                  <Settings2Icon aria-hidden="true" />
                  {customSource ? 'Hide custom model source' : 'Use a custom model source'}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
                <TextField
                  description="Use only when the connected agent accepts a source outside its catalog."
                  label="Provider identifier"
                  onChange={(value) => update('provider', value)}
                  value={draft.provider}
                />
                <TextField
                  label="Model identifier"
                  onChange={(value) => update('model', value)}
                  value={draft.model}
                />
              </CollapsibleContent>
            </Collapsible>
            <TextField
              label="Specialization"
              onChange={(value) => update('specialization', value)}
              value={draft.specialization}
            />
            <TextField
              description="Separate multiple entries with commas."
              label="Keywords"
              onChange={(value) => update('keywords', value)}
              value={draft.keywords}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                description="Separate multiple entries with commas."
                label="Skills"
                onChange={(value) => update('skills', value)}
                value={draft.skills}
              />
              <TextField
                description="Separate multiple entries with commas."
                label="Commands"
                onChange={(value) => update('commands', value)}
                value={draft.commands}
              />
            </div>
            <Field>
              <FieldLabel>Tools</FieldLabel>
              <Command className="rounded-lg border">
                <CommandInput placeholder="Search available tools" />
                <CommandList className="max-h-52">
                  {toolsPending ? (
                    <div
                      className="px-3 py-6 text-center text-sm text-muted-foreground"
                      role="status"
                    >
                      Loading available tools…
                    </div>
                  ) : toolsError ? (
                    <div className="px-3 py-6 text-center text-sm text-destructive" role="alert">
                      Available tools could not be loaded.
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>No available tools match this search.</CommandEmpty>
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
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {id}
                              </span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </Field>
          </FieldGroup>
        </div>
        <div className="grid gap-3 border-t pt-4">
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
              onClick={() =>
                void onSave(
                  agentFromDraft(agent, {
                    ...draft,
                    provider: effectiveProvider,
                    model: effectiveModel,
                  }),
                )
              }
            >
              {pending ? 'Saving…' : 'Save agent'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  description,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  description?: string;
  id?: string;
}) {
  const inputId = id ?? `agent-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Input
        disabled={disabled}
        id={inputId}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
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
