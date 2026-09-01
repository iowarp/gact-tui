import type {
  CommandDefinition,
  MessageBehavior,
  MessageDelivery,
  QueuedMessage,
  RunState,
} from '@clio/core/v3';
import type { FileUIPart } from 'ai';
import { CornerDownRightIcon, PlusIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { brand } from '@brand';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import {
  PromptInput,
  PromptInputButton,
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandItem,
  PromptInputCommandList,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input';
import { ClioStatus } from './status';
import { ClioModelPicker } from './model-picker';
import { Button } from '@/components/ui/button';
import { providerLogoId } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';
import { ClioComposerAttachments } from './composer-attachments';
import { ClioComposerQueue } from './composer-queue';
import { ClioComposerBehaviorControls } from './composer-behavior-controls';
import type { ResourceUploadProgress } from '@/lib/upload-workspace-resources';

export interface ClioComposerProps {
  state: RunState;
  attachments: boolean;
  provider?: string;
  model?: string;
  effort?: string;
  executionMode?: MessageBehavior['execution_mode'];
  confirmationPolicy?: MessageBehavior['confirmation_policy'];
  modelOptions?: Array<{
    providerId: string;
    providerName: string;
    id: string;
    label: string;
    description?: string;
    available: boolean;
    availabilityDetail?: string;
    configurationUrl?: string;
    endpoint?: string;
    freshness?: string;
    health?: string;
    modalities?: readonly string[];
  }>;
  disabled?: boolean;
  commands?: CommandDefinition[];
  onSubmit: (value: {
    text: string;
    files: FileUIPart[];
    provider?: string;
    model?: string;
    effort?: string;
    delivery: MessageDelivery | 'queued';
    behavior: MessageBehavior;
    onUploadProgress: (progress: ResourceUploadProgress) => void;
  }) => Promise<void>;
  onStop?: () => void;
  onCommand?: (value: { commandId: string; input: string }) => Promise<void>;
  activityControl?: ReactNode;
  queuedMessages?: QueuedMessage[];
  queueBusy?: boolean;
  onDeleteQueuedMessage?: (message: QueuedMessage) => Promise<void>;
  onPromoteQueuedMessage?: (message: QueuedMessage, delivery: MessageDelivery) => Promise<void>;
  onReorderQueuedMessages?: (messages: QueuedMessage[]) => Promise<void>;
  onUpdateQueuedMessage?: (message: QueuedMessage, text: string) => Promise<void>;
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
  executionMode = 'execute',
  confirmationPolicy = 'ask',
  modelOptions = [],
  disabled,
  commands = [],
  onSubmit,
  onStop,
  onCommand,
  activityControl,
  queuedMessages = [],
  queueBusy,
  onDeleteQueuedMessage,
  onPromoteQueuedMessage,
  onReorderQueuedMessages,
  onUpdateQueuedMessage,
  value,
  onValueChange,
  focusRequestKey,
  variant = 'docked',
}: ClioComposerProps) {
  const [selectedProvider, setSelectedProvider] = useState(provider);
  const [selectedModel, setSelectedModel] = useState(model);
  const [behavior, setBehavior] = useState<MessageBehavior>({
    confirmation_policy: confirmationPolicy,
    execution_mode: executionMode,
    reasoning_effort: toReasoningEffort(effort),
  });
  const [uploadProgress, setUploadProgress] = useState<ResourceUploadProgress>();
  const nextDeliveryRef = useRef<MessageDelivery | 'queued'>('start');
  const [internalInput, setInternalInput] = useState('');
  const input = value ?? internalInput;
  const setInput = (nextValue: string) => {
    if (value === undefined) setInternalInput(nextValue);
    onValueChange?.(nextValue);
  };
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const handledFocusRequestKeyRef = useRef(focusRequestKey);
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
  const selectedOption = modelOptions.find(
    (option) =>
      option.providerId === selectedProvider && option.id === selectedModel && option.available,
  );

  useEffect(() => {
    const previousKey = handledFocusRequestKeyRef.current;
    handledFocusRequestKeyRef.current = focusRequestKey;
    if (focusRequestKey === undefined || focusRequestKey === previousKey) return;
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
      {queuedMessages.length > 0 &&
      onDeleteQueuedMessage &&
      onPromoteQueuedMessage &&
      onReorderQueuedMessages &&
      onUpdateQueuedMessage ? (
        <ClioComposerQueue
          busy={queueBusy}
          messages={queuedMessages}
          onDelete={onDeleteQueuedMessage}
          onPromote={onPromoteQueuedMessage}
          onReorder={onReorderQueuedMessages}
          onUpdate={onUpdateQueuedMessage}
          promoteDelivery={state === 'running' ? 'steer' : 'start'}
        />
      ) : null}
      <PromptInput
        className="mx-auto max-w-4xl rounded-2xl border-border/80 bg-card/95 shadow-[0_12px_32px_-18px_rgb(0_0_0/0.8)] backdrop-blur"
        maxFileSize={250 * 1024 * 1024}
        multiple
        onError={(error) => toast.error('Attachment was not added', { description: error.message })}
        onSubmit={async ({ files, text }) => {
          const trimmed = text.trim();
          if (trimmed || files.length > 0) {
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
                behavior,
                delivery: state === 'running' ? nextDeliveryRef.current : 'start',
                files,
                text: trimmed,
                provider: selectedOption?.providerId,
                model: selectedOption?.id,
                effort: behavior.reasoning_effort,
                onUploadProgress: setUploadProgress,
              });
            } catch (error) {
              setUploadProgress(undefined);
              toast.error(
                state === 'running' ? 'Message was not accepted' : 'Message was not sent',
                {
                  description: error instanceof Error ? error.message : 'The service rejected it.',
                },
              );
              throw error;
            }
            nextDeliveryRef.current = state === 'running' ? 'queued' : 'start';
            setUploadProgress(undefined);
            setInput('');
          }
        }}
      >
        {activityControl ? (
          <PromptInputHeader className="border-b px-2.5 py-1.5">
            {activityControl}
          </PromptInputHeader>
        ) : null}
        <ClioComposerAttachments />
        {uploadProgress ? (
          <div className="px-3 pt-1 text-xs text-muted-foreground" role="status">
            Uploading {uploadProgress.filename}{' '}
            {uploadProgress.total > 0
              ? `${Math.round((uploadProgress.loaded / uploadProgress.total) * 100)}%`
              : ''}
          </div>
        ) : null}
        <PromptInputTextarea
          disabled={disabled}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder={`Ask ${brand.name} to investigate, build, explain, or act…`}
          ref={inputRef}
          value={input}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            nextDeliveryRef.current =
              state === 'running' ? (event.ctrlKey || event.metaKey ? 'steer' : 'queued') : 'start';
            if (state === 'running') {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <PromptInputFooter className="flex-wrap">
          <PromptInputTools className="min-w-0 flex-1 flex-wrap">
            {attachments ? <ComposerAddAttachmentButton /> : null}
            <ClioComposerBehaviorControls
              behavior={behavior}
              disabled={disabled}
              modelControl={
                <ClioModelPicker
                  model={selectedOption?.id}
                  onChange={(option) => {
                    setSelectedProvider(option.providerId);
                    setSelectedModel(option.id);
                  }}
                  options={modelOptions}
                  provider={selectedOption?.providerId}
                  trigger={
                    <Button
                      aria-label="Change model"
                      className="max-w-48 text-foreground"
                      size="sm"
                      title="Change model"
                      type="button"
                      variant="outline"
                    >
                      {selectedOption ? (
                        <ModelSelectorLogo provider={providerLogoId(selectedOption.providerId)} />
                      ) : null}
                      <span className="truncate">
                        {selectedOption
                          ? `${compactProviderName(selectedOption.providerId)} / ${compactModelName(selectedOption.providerId, selectedOption.id, selectedOption.label)}`
                          : 'Choose model'}
                      </span>
                    </Button>
                  }
                />
              }
              onChange={setBehavior}
            />
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
                  onClick={() => {
                    nextDeliveryRef.current = 'steer';
                  }}
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

function ComposerAddAttachmentButton() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton
      aria-label="Add files"
      onClick={attachments.openFileDialog}
      title="Add files"
    >
      <PlusIcon aria-hidden="true" />
    </PromptInputButton>
  );
}

function toReasoningEffort(value?: string): MessageBehavior['reasoning_effort'] {
  if (value === 'off' || value === 'low' || value === 'high' || value === 'xhigh') return value;
  return 'medium';
}

function compactProviderName(provider?: string): string {
  const names: Record<string, string> = {
    argonne_local_vllm: 'vLLM',
    claude_code: 'Claude',
    codex: 'Codex',
    lm_studio: 'LM Studio',
  };
  if (!provider) return 'Provider';
  return names[provider] ?? provider.replaceAll('_', ' ');
}

function compactModelName(provider: string, modelId: string, label: string): string {
  if (provider === 'codex') {
    const familyName = modelId.match(/(?:^|[-_.])(luna|sol|terra)$/i)?.[1];
    if (familyName)
      return `${familyName.charAt(0).toUpperCase()}${familyName.slice(1).toLowerCase()}`;
  }
  if (provider === 'claude_code' && /sonnet/i.test(modelId)) return 'Sonnet';
  return label;
}
