import type {
  CommandDefinition,
  ComposerMessagePart,
  MessageBehavior,
  MessageDelivery,
  QueuedMessage,
  RunState,
  WorkspaceReference,
  WorkspaceResource,
} from '@clio/core/v3';
import type { FileUIPart } from 'ai';
import { AtSignIcon, CornerDownRightIcon, PaperclipIcon, PlusIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
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
import { ClioComposerAttachments, type ResourceUploadFailure } from './composer-attachments';
import { ClioComposerQueue } from './composer-queue';
import { ClioComposerBehaviorControls } from './composer-behavior-controls';
import type { ResourceUploadProgress } from '@/lib/upload-workspace-resources';
import type { WorkspaceResourceUploadResult } from '@/lib/upload-workspace-resources';
import { ClioComposerReferenceChips, ClioComposerReferenceMenu } from './composer-references';
import { toMessagePart, workspaceReferenceIdentity } from './composer-reference-domain';

export interface ClioComposerProps {
  state: RunState;
  attachments: boolean;
  provider?: string;
  model?: string;
  modelCatalogStatus?: 'error' | 'loading' | 'ready';
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
  contextReferences?: boolean;
  workspaceId?: string;
  commands?: CommandDefinition[];
  onSubmit: (value: {
    text: string;
    files: FileUIPart[];
    references: Exclude<ComposerMessagePart, { type: 'text' }>[];
    provider?: string;
    model?: string;
    effort?: string;
    delivery: MessageDelivery | 'queued';
    behavior: MessageBehavior;
    onUploadProgress: (progress: ResourceUploadProgress) => void;
  }) => Promise<void>;
  onPrepareFiles?: (
    files: readonly FileUIPart[],
    onProgress?: (progress: ResourceUploadProgress) => void,
  ) => Promise<WorkspaceResourceUploadResult>;
  onStop?: () => void;
  onCommand?: (value: { commandId: string; input: string }) => Promise<void>;
  onRetryModelCatalog?: () => void;
  onHeightChange?: (height: number) => void;
  activityControl?: ReactNode;
  pendingInteractions?: ReactNode;
  queuedMessages?: QueuedMessage[];
  resources?: readonly WorkspaceResource[];
  queueBusy?: boolean;
  onDeleteQueuedMessage?: (message: QueuedMessage) => Promise<void>;
  onPromoteQueuedMessage?: (message: QueuedMessage, delivery: MessageDelivery) => Promise<void>;
  onOpenResource?: (resource: WorkspaceResource) => void;
  onOpenReference?: (reference: WorkspaceReference) => void;
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
  modelCatalogStatus = 'ready',
  effort,
  executionMode = 'execute',
  confirmationPolicy = 'ask',
  modelOptions = [],
  disabled,
  contextReferences = false,
  workspaceId = '',
  commands = [],
  onSubmit,
  onPrepareFiles,
  onStop,
  onCommand,
  onRetryModelCatalog,
  onHeightChange,
  activityControl,
  pendingInteractions,
  queuedMessages = [],
  resources = [],
  queueBusy,
  onDeleteQueuedMessage,
  onPromoteQueuedMessage,
  onOpenResource,
  onOpenReference,
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
    reasoning_effort: knownReasoningEffort(effort) ?? DEFAULT_REASONING_EFFORT,
  });
  // Kept apart from `behavior`, which must always carry a value the message
  // contract accepts. The control names this rather than showing the default as
  // though the service had asked for it.
  const unrecognizedEffort = effort && !knownReasoningEffort(effort) ? effort : undefined;
  const [uploadProgress, setUploadProgress] = useState<ResourceUploadProgress>();
  const [selectedReferences, setSelectedReferences] = useState<WorkspaceReference[]>([]);
  const [referenceOptions, setReferenceOptions] = useState<readonly WorkspaceReference[]>([]);
  const [activeReferenceId, setActiveReferenceId] = useState<string>();
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [referenceSearchQuery, setReferenceSearchQuery] = useState('');
  const [uploadFailure, setUploadFailure] = useState<ResourceUploadFailure>();
  // The attachment in flight when a submit is rejected; the progress state is
  // cleared on the way out, so the name is kept separately.
  const uploadingFilenameRef = useRef<string>(undefined);
  const nextDeliveryRef = useRef<MessageDelivery | 'queued'>('start');
  const [internalInput, setInternalInput] = useState('');
  const input = value ?? internalInput;
  const setInput = useCallback(
    (nextValue: string) => {
      if (value === undefined) setInternalInput(nextValue);
      onValueChange?.(nextValue);
    },
    [onValueChange, value],
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handledFocusRequestKeyRef = useRef(focusRequestKey);
  const restoreFocusAfterSubmitRef = useRef(false);
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
  const referenceToken = input.match(/(?:^|\s)@([^\s]*)$/);
  const referenceQuery = referenceToken?.[1] ?? '';
  const effectiveReferenceQuery = referencePickerOpen ? referenceSearchQuery : referenceQuery;
  const showReferences =
    contextReferences && Boolean(workspaceId) && (referencePickerOpen || Boolean(referenceToken));
  const effectiveActiveReferenceId =
    activeReferenceId &&
    referenceOptions.some(
      (reference) => workspaceReferenceIdentity(reference) === activeReferenceId,
    )
      ? activeReferenceId
      : referenceOptions[0]
        ? workspaceReferenceIdentity(referenceOptions[0])
        : undefined;
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

  useEffect(() => {
    if (disabled || !restoreFocusAfterSubmitRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element || element.disabled) return;
      restoreFocusAfterSubmitRef.current = false;
      element.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [disabled]);

  const restoreInputFocusWhenReady = () => {
    window.requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element || element.disabled) return;
      restoreFocusAfterSubmitRef.current = false;
      element.focus({ preventScroll: true });
    });
  };

  const selectReference = useCallback(
    (reference: WorkspaceReference) => {
      setSelectedReferences((current) =>
        current.some(
          (candidate) =>
            workspaceReferenceIdentity(candidate) === workspaceReferenceIdentity(reference),
        )
          ? current
          : [...current, reference],
      );
      if (referenceToken) {
        setInput(`${input.slice(0, referenceToken.index ?? input.length).trimEnd()} `);
      }
      setReferencePickerOpen(false);
      setReferenceSearchQuery('');
      setReferenceOptions([]);
      setActiveReferenceId(undefined);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    },
    [input, referenceToken, setInput],
  );

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (variant !== 'docked' || !element || !onHeightChange) return;
    const reportHeight = () => onHeightChange(Math.ceil(element.getBoundingClientRect().height));
    reportHeight();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(reportHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeightChange, variant]);

  return (
    <div
      data-slot="clio-composer-stack"
      className={cn(
        'relative',
        variant === 'docked'
          ? cn(
              'pointer-events-none flex max-h-full min-h-0 flex-col px-4 pb-3 [&>*]:pointer-events-auto lg:px-6',
              showCommands || showReferences ? 'overflow-visible' : 'overflow-hidden',
            )
          : 'w-full',
      )}
      ref={rootRef}
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
      {showReferences && !showCommands ? (
        <div className="absolute inset-x-4 bottom-full z-20 mx-auto max-w-4xl pb-2 lg:inset-x-6">
          <ClioComposerReferenceMenu
            activeReferenceId={effectiveActiveReferenceId}
            onActiveReferenceChange={setActiveReferenceId}
            onReferencesChange={setReferenceOptions}
            onSelect={selectReference}
            onQueryChange={setReferenceSearchQuery}
            query={effectiveReferenceQuery}
            searchInput={referencePickerOpen}
            workspaceId={workspaceId}
          />
        </div>
      ) : null}
      {pendingInteractions}
      {queuedMessages.length > 0 &&
      onDeleteQueuedMessage &&
      onPromoteQueuedMessage &&
      onReorderQueuedMessages &&
      onUpdateQueuedMessage ? (
        <ClioComposerQueue
          busy={queueBusy}
          messages={queuedMessages}
          onDelete={onDeleteQueuedMessage}
          onOpenResource={onOpenResource}
          onPromote={onPromoteQueuedMessage}
          onReorder={onReorderQueuedMessages}
          onUpdate={onUpdateQueuedMessage}
          promoteDelivery={state === 'running' ? 'steer' : 'start'}
          resources={resources}
        />
      ) : null}
      <PromptInput
        className="mx-auto max-w-4xl shrink-0 rounded-2xl border-border/30 bg-card/70 shadow-[0_12px_32px_-18px_rgb(0_0_0/0.8)] backdrop-blur-xl [&_[data-slot=input-group]]:border-border/30 [&_[data-slot=input-group]]:bg-card/70 dark:bg-card/60 dark:[&_[data-slot=input-group]]:bg-card/60"
        maxFileSize={250 * 1024 * 1024}
        multiple
        onError={(error) => toast.error('Attachment was not added', { description: error.message })}
        onSubmit={async ({ files, text }) => {
          const trimmed = text.trim();
          if (trimmed || files.length > 0 || selectedReferences.length > 0) {
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
              restoreFocusAfterSubmitRef.current = true;
              try {
                await onCommand({ commandId: command.id, input: parts.join(' ') });
                setInput('');
              } catch (error) {
                // PromptInput swallows a rejected submit so the draft survives;
                // without this the refusal would never reach the person.
                toast.error(`${command.title} was not run`, {
                  description: error instanceof Error ? error.message : 'The service rejected it.',
                });
                throw error;
              } finally {
                restoreInputFocusWhenReady();
              }
              return;
            }
            restoreFocusAfterSubmitRef.current = true;
            setUploadFailure(undefined);
            uploadingFilenameRef.current = undefined;
            try {
              await onSubmit({
                behavior,
                delivery: state === 'running' ? nextDeliveryRef.current : 'start',
                files,
                references: selectedReferences.map(toMessagePart),
                text: trimmed,
                provider: selectedOption?.providerId,
                model: selectedOption?.id,
                effort: behavior.reasoning_effort,
                onUploadProgress: (progress) => {
                  uploadingFilenameRef.current = progress.filename;
                  setUploadProgress(progress);
                },
              });
            } catch (error) {
              setUploadProgress(undefined);
              setUploadFailure({
                filename: uploadingFilenameRef.current,
                message: error instanceof Error ? error.message : 'The service rejected it.',
              });
              toast.error(
                state === 'running' ? 'Message was not accepted' : 'Message was not sent',
                {
                  description: error instanceof Error ? error.message : 'The service rejected it.',
                },
              );
              throw error;
            } finally {
              setUploadProgress(undefined);
              restoreInputFocusWhenReady();
            }
            nextDeliveryRef.current = state === 'running' ? 'queued' : 'start';
            setInput('');
            setSelectedReferences([]);
          }
        }}
      >
        {activityControl ? (
          <PromptInputHeader className="border-b px-2.5 py-1.5">
            {activityControl}
          </PromptInputHeader>
        ) : null}
        <ClioComposerAttachments
          onPrepareFiles={onPrepareFiles}
          resources={resources}
          uploadFailure={uploadFailure}
          uploadProgress={uploadProgress}
        />
        <ClioComposerReferenceChips
          onOpen={onOpenReference}
          onRemove={(reference) =>
            setSelectedReferences((current) =>
              current.filter(
                (candidate) =>
                  workspaceReferenceIdentity(candidate) !== workspaceReferenceIdentity(reference),
              ),
            )
          }
          references={selectedReferences}
        />
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
            if (showReferences && referenceOptions.length > 0) {
              const activeIndex = referenceOptions.findIndex(
                (reference) => workspaceReferenceIdentity(reference) === effectiveActiveReferenceId,
              );
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                const nextIndex =
                  (Math.max(activeIndex, 0) + direction + referenceOptions.length) %
                  referenceOptions.length;
                setActiveReferenceId(workspaceReferenceIdentity(referenceOptions[nextIndex]!));
                return;
              }
              if (
                (event.key === 'Enter' || event.key === 'Tab') &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                selectReference(referenceOptions[Math.max(activeIndex, 0)]!);
                return;
              }
            }
            if (showReferences && event.key === 'Escape') {
              event.preventDefault();
              setReferencePickerOpen(false);
              setReferenceSearchQuery('');
              if (referenceToken) {
                setInput(input.slice(0, referenceToken.index ?? input.length).trimEnd());
              }
              return;
            }
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
            {attachments || contextReferences ? (
              <ComposerAddContextButton
                attachments={attachments}
                contextReferences={contextReferences}
                onOpenReferences={() => {
                  setReferenceSearchQuery('');
                  setReferencePickerOpen(true);
                }}
              />
            ) : null}
            <ClioComposerBehaviorControls
              behavior={behavior}
              disabled={disabled}
              modelControl={
                <ClioModelPicker
                  catalogStatus={modelCatalogStatus}
                  model={selectedOption?.id}
                  onChange={(option) => {
                    setSelectedProvider(option.providerId);
                    setSelectedModel(option.id);
                  }}
                  onRetryCatalog={onRetryModelCatalog}
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
              unrecognizedEffort={unrecognizedEffort}
            />
          </PromptInputTools>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {state === 'running' ? (
              <PromptInputButton
                aria-label="Steer current work"
                className="gap-1.5 border-action/40 text-action hover:bg-action/10 hover:text-action"
                disabled={disabled || (!input.trim() && selectedReferences.length === 0)}
                onClick={() => {
                  nextDeliveryRef.current = 'steer';
                }}
                title="Join the active turn at the next safe boundary"
                type="submit"
                variant="outline"
              >
                <CornerDownRightIcon aria-hidden="true" />
                <span className="hidden sm:inline">Steer</span>
              </PromptInputButton>
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

function ComposerAddContextButton({
  attachments: attachmentEnabled,
  contextReferences,
  onOpenReferences,
}: {
  attachments: boolean;
  contextReferences: boolean;
  onOpenReferences: () => void;
}) {
  const attachments = usePromptInputAttachments();
  if (!contextReferences) {
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
  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger aria-label="Add context" title="Add context">
        <PlusIcon aria-hidden="true" />
      </PromptInputActionMenuTrigger>
      <PromptInputActionMenuContent>
        {attachmentEnabled ? (
          <PromptInputActionMenuItem onSelect={attachments.openFileDialog}>
            <PaperclipIcon aria-hidden="true" />
            Attach new file
          </PromptInputActionMenuItem>
        ) : null}
        <PromptInputActionMenuItem onSelect={onOpenReferences}>
          <AtSignIcon aria-hidden="true" />
          Reference existing context
        </PromptInputActionMenuItem>
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  );
}

const DEFAULT_REASONING_EFFORT: MessageBehavior['reasoning_effort'] = 'medium';

/** The reported effort, or nothing when this build has no setting for it. */
function knownReasoningEffort(value?: string): MessageBehavior['reasoning_effort'] | undefined {
  if (
    value === 'off' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
  ) {
    return value;
  }
  return undefined;
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
