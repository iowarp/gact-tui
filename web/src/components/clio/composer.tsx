import type { CommandDefinition, RunState } from '@clio/core/v3';
import {
  ChevronDownIcon,
  CornerDownRightIcon,
  PaperclipIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { brand } from '@brand';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputButton,
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandItem,
  PromptInputCommandList,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { ClioStatus } from './status';
import { ClioModelPicker } from './model-picker';
import { providerLogoId } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';

export interface ClioComposerProps {
  state: RunState;
  attachments: boolean;
  provider?: string;
  model?: string;
  effort?: string;
  modelOptions?: Array<{
    providerId: string;
    providerName: string;
    id: string;
    label: string;
    description?: string;
    available: boolean;
    availabilityDetail?: string;
  }>;
  disabled?: boolean;
  commands?: CommandDefinition[];
  onSubmit: (value: {
    text: string;
    provider?: string;
    model?: string;
    effort?: string;
  }) => Promise<void>;
  onStop?: () => void;
  onCommand?: (value: { commandId: string; input: string }) => Promise<void>;
  activityControl?: ReactNode;
  behaviorControl?: ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  focusRequestKey?: number;
  variant?: 'docked' | 'welcome';
}

function chatStatus(state: RunState): 'ready' | 'submitted' | 'streaming' | 'error' {
  if (state === 'queued') return 'submitted';
  if (state === 'running') return 'streaming';
  if (state === 'failed') return 'error';
  return 'ready';
}

export function ClioComposer({
  state,
  attachments,
  provider,
  model,
  effort,
  modelOptions = [],
  disabled,
  commands = [],
  onSubmit,
  onStop,
  onCommand,
  activityControl,
  behaviorControl,
  value,
  onValueChange,
  focusRequestKey,
  variant = 'docked',
}: ClioComposerProps) {
  const [selectedProvider, setSelectedProvider] = useState(provider);
  const [selectedModel, setSelectedModel] = useState(model);
  const [selectedEffort, setSelectedEffort] = useState(effort);
  const [internalInput, setInternalInput] = useState('');
  const input = value ?? internalInput;
  const setInput = (nextValue: string) => {
    if (value === undefined) setInternalInput(nextValue);
    onValueChange?.(nextValue);
  };
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commandQuery = input.trimStart();
  const commandMatches = useMemo(() => {
    if (!commandQuery.startsWith('/') || commandQuery.includes(' ')) return [];
    const query = commandQuery.toLocaleLowerCase();
    return commands.filter((command) =>
      [command.id, command.title, ...command.aliases].some((value) =>
        value.toLocaleLowerCase().includes(query),
      ),
    );
  }, [commandQuery, commands]);
  const showCommands = commandQuery.startsWith('/') && !commandQuery.includes(' ');

  useEffect(() => {
    if (focusRequestKey === undefined) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestKey]);

  return (
    <div
      className={cn(
        'relative',
        variant === 'docked'
          ? 'bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-3 pt-6 lg:px-6'
          : 'w-full',
      )}
    >
      {showCommands ? (
        <div className="absolute inset-x-4 bottom-full z-20 mx-auto max-w-4xl pb-2 lg:inset-x-6">
          <PromptInputCommand className="rounded-xl border bg-popover text-popover-foreground shadow-xl">
            <PromptInputCommandList className="max-h-64">
              <PromptInputCommandEmpty>No service command matches.</PromptInputCommandEmpty>
              <PromptInputCommandGroup heading="Service commands">
                {commandMatches.map((command) => (
                  <PromptInputCommandItem
                    aria-label={`${command.title} ${command.id}`}
                    disabled={!command.enabled}
                    key={command.id}
                    onSelect={() => {
                      setInput(`${command.id} `);
                      window.requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    value={`${command.id} ${command.title} ${command.aliases.join(' ')}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        <span>{command.title}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {command.id}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {command.enabled
                          ? command.argument_hint || command.description || 'Run this command'
                          : command.disabled_reason || 'Unavailable'}
                      </span>
                    </span>
                  </PromptInputCommandItem>
                ))}
              </PromptInputCommandGroup>
            </PromptInputCommandList>
          </PromptInputCommand>
        </div>
      ) : null}
      <PromptInput
        className="mx-auto max-w-4xl rounded-2xl border-border/80 bg-card/95 shadow-[0_12px_32px_-18px_rgb(0_0_0/0.8)] backdrop-blur"
        onSubmit={async ({ text }) => {
          const trimmed = text.trim();
          if (trimmed) {
            if (trimmed.startsWith('/')) {
              const [enteredId = '', ...parts] = trimmed.split(/\s+/);
              const command = commands.find(
                (candidate) => candidate.id === enteredId || candidate.aliases.includes(enteredId),
              );
              if (!command) {
                toast.error('Unknown command', {
                  description: 'Choose a command reported by the connected service.',
                });
                return;
              }
              if (!command.enabled) {
                toast.error(`${command.title} is unavailable`, {
                  description: command.disabled_reason,
                });
                return;
              }
              if (!onCommand) {
                toast.error('Commands are unavailable for this session');
                return;
              }
              await onCommand({ commandId: command.id, input: parts.join(' ') });
              setInput('');
              return;
            }
            try {
              await onSubmit({
                text: trimmed,
                provider: selectedProvider,
                model: selectedModel,
                effort: selectedEffort,
              });
            } catch (error) {
              toast.error(
                state === 'running' ? 'Direction was not queued' : 'Message was not sent',
                {
                  description: error instanceof Error ? error.message : 'The service rejected it.',
                },
              );
              throw error;
            }
            setInput('');
          }
        }}
      >
        {activityControl ? (
          <PromptInputHeader className="border-b px-2.5 py-1.5">
            {activityControl}
          </PromptInputHeader>
        ) : null}
        <PromptInputTextarea
          disabled={disabled}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder={`Ask ${brand.name} to investigate, build, explain, or act…`}
          ref={inputRef}
          value={input}
        />
        <PromptInputFooter className="flex-wrap">
          <PromptInputTools className="min-w-0 flex-1 flex-wrap">
            {behaviorControl}
            {attachments ? (
              <PromptInputActionAddAttachments aria-label="Attach files">
                <PaperclipIcon aria-hidden="true" />
              </PromptInputActionAddAttachments>
            ) : null}
            <ClioModelPicker
              model={selectedModel}
              onChange={(option) => {
                setSelectedProvider(option.providerId);
                setSelectedModel(option.id);
              }}
              options={modelOptions}
              provider={selectedProvider}
              trigger={
                <PromptInputButton aria-label="Choose model" className="max-w-44 !text-foreground">
                  {selectedProvider ? (
                    <ModelSelectorLogo provider={providerLogoId(selectedProvider)} />
                  ) : null}
                  <span className="truncate">{selectedModel ?? 'Choose model'}</span>
                  <ChevronDownIcon aria-hidden="true" className="size-3.5" />
                </PromptInputButton>
              }
            />
            <PromptInputSelect onValueChange={setSelectedEffort} value={selectedEffort ?? 'medium'}>
              <PromptInputSelectTrigger
                aria-label="Effort"
                className="hidden w-auto !text-foreground sm:flex"
              >
                <SlidersHorizontalIcon aria-hidden="true" className="size-3.5" />
                <PromptInputSelectValue placeholder="Effort" />
              </PromptInputSelectTrigger>
              <PromptInputSelectContent>
                {['off', 'low', 'medium', 'high'].map((value) => (
                  <PromptInputSelectItem className="capitalize" key={value} value={value}>
                    {value}
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
          </PromptInputTools>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {state === 'running' ? (
              <>
                <ClioStatus
                  className="hidden sm:flex"
                  detail="New input joins the active turn at the next safe boundary"
                  label="Working"
                  value="running"
                />
                <PromptInputButton
                  aria-label="Steer current work"
                  className="gap-1.5 border-action/40 text-action hover:bg-action/10 hover:text-action"
                  disabled={disabled || !input.trim()}
                  type="submit"
                  variant="outline"
                >
                  <CornerDownRightIcon aria-hidden="true" />
                  <span className="hidden sm:inline">Steer</span>
                </PromptInputButton>
              </>
            ) : state === 'waiting_permission' || state === 'waiting_user' ? (
              <ClioStatus value={state} />
            ) : null}
            <PromptInputSubmit
              disabled={disabled && state !== 'running'}
              onStop={onStop}
              status={chatStatus(state)}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
