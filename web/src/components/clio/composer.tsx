import type {
  CommandDefinition,
  ComposerMessagePart,
  MessageBehavior,
  MessageDelivery,
  RunState,
  WorkspaceReference,
  WorkspaceResource,
} from '@clio/core/v3';
import { CornerDownRightIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
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
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { ClioStatus } from './status';
import { ClioModelPicker } from './model-picker';
import { useComposerModelSelection } from './use-composer-model-selection';
import { useSpotterAvailability } from '@/hooks/use-spotter-availability';
import { Button } from '@/components/ui/button';
import { providerLogoId } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';
import { ClioComposerAttachments, type ResourceUploadFailure } from './composer-attachments';
import { ClioComposerQueue, type ComposerQueueControls } from './composer-queue';
import { ClioComposerBehaviorControls } from './composer-behavior-controls';
import {
  defaultReasoningLabel,
  effectiveReasoningEffort,
  knownReasoningEffort,
  type ModelReasoningLevels,
} from '@/lib/reasoning-levels';
import type {
  ResourceUploadProgress,
  UploadableFilePart,
  WorkspaceResourceUploadResult,
} from '@/lib/upload-workspace-resources';
import { ClioComposerReferenceMenu } from './composer-references';
import { useComposerReferenceController } from './composer-reference-controller';
import { toMessagePart, type InlineReferenceSelection } from '@/lib/composer-reference-domain';
import { ComposerInlineReferenceEditor } from './composer-inline-reference-editor';
import { focusEditorAtOffset as focusComposerEditor } from './composer-editor-model';
import { ClioComposerFileUpload } from './composer-file-upload';
import { ClioComposerAnnotations } from './composer-annotations';
import { messageTextWithAnnotations, type ComposerAnnotation } from '@/lib/composer-annotations';
import { composerModelLabel } from './composer-model-label';
import { setModelImageInput } from '@/lib/model-image-input';
import { useRegionCaptureAnnotation } from './use-region-capture-annotation';
import { ComposerAddContextButton } from './composer-add-context-button';
import { ClioComposerEvidenceControls } from './composer-evidence-controls';
import { useComposerSources } from './use-composer-sources';
import {
  isSourceAttachment,
  useComposerSourceAttachments,
} from './use-composer-source-attachments';

export interface ClioComposerProps extends ComposerQueueControls {
  state: RunState;
  attachments: boolean;
  provider?: string;
  model?: string;
  modelCatalogStatus?: 'error' | 'loading' | 'ready';
  effort?: string;
  /** The configured (global) level: displayed when nothing is picked, never sent. */
  configuredEffort?: string;
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
    reasoning?: ModelReasoningLevels;
    aliases?: readonly string[];
  }>;
  disabled?: boolean;
  /** Keep the draft editable while the first session catalog is registering. */
  catalogPreparing?: boolean;
  contextReferences?: boolean;
  workspaceId?: string;
  sessionId?: string;
  commands?: CommandDefinition[];
  onSubmit: (value: {
    text: string;
    files: UploadableFilePart[];
    references: Exclude<ComposerMessagePart, { type: 'text' }>[];
    provider?: string;
    model?: string;
    delivery: MessageDelivery | 'queued';
    behavior: MessageBehavior;
    onUploadProgress: (progress: ResourceUploadProgress) => void;
  }) => Promise<void>;
  onBehaviorChange?: (behavior: MessageBehavior) => Promise<void>;
  onDiscardFiles?: (files: readonly UploadableFilePart[]) => Promise<void>;
  onPrepareFiles?: (
    files: readonly UploadableFilePart[],
    onProgress?: (progress: ResourceUploadProgress) => void,
    signal?: AbortSignal,
  ) => Promise<WorkspaceResourceUploadResult>;
  onStop?: () => void;
  onCommand?: (value: { commandId: string; input: string }) => Promise<void>;
  onRetryModelCatalog?: (providerId?: string) => void;
  onHeightChange?: (height: number) => void;
  activityControl?: ReactNode;
  workSummary?: ReactNode;
  pendingInteractions?: ReactNode;
  resources?: readonly WorkspaceResource[];
  onOpenResource?: (resource: WorkspaceResource) => void;
  onOpenReference?: (reference: WorkspaceReference) => void;
  value?: string;
  onValueChange?: (value: string) => void;
  /**
   * The references the draft carries. Controlled alongside `value` by whoever
   * owns the draft: the composer is remounted whenever the session, model or
   * layout branch changes, so state kept inside it would be destroyed while the
   * text beside it survived.
   */
  references?: readonly InlineReferenceSelection[];
  onReferencesChange?: (references: readonly InlineReferenceSelection[]) => void;
  /** Selections attached to the next message (sent as quotes ahead of the text). */
  annotations?: readonly ComposerAnnotation[];
  onAnnotationsChange?: (annotations: readonly ComposerAnnotation[]) => void;
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
  configuredEffort,
  executionMode = 'execute',
  confirmationPolicy = 'ask',
  modelOptions = [],
  disabled,
  catalogPreparing = false,
  contextReferences = false,
  workspaceId = '',
  sessionId,
  commands = [],
  onSubmit,
  onBehaviorChange,
  onPrepareFiles,
  onDiscardFiles,
  onStop,
  onCommand,
  onRetryModelCatalog,
  onHeightChange,
  activityControl,
  workSummary,
  pendingInteractions,
  queuedMessages = [],
  resources = [],
  queueBusy,
  queuePaused = false,
  onDeleteQueuedMessage,
  onPromoteQueuedMessage,
  onOpenResource,
  onOpenReference,
  onReorderQueuedMessages,
  onUpdateQueuedMessage,
  value,
  onValueChange,
  references,
  onReferencesChange,
  annotations = [],
  onAnnotationsChange,
  focusRequestKey,
  variant = 'docked',
}: ClioComposerProps) {
  const spotterAvailability = useSpotterAvailability(workspaceId);
  const { selectedOption, selectModel } = useComposerModelSelection(modelOptions, provider, model);
  useEffect(() => {
    setModelImageInput(Boolean(selectedOption?.modalities?.includes('image')));
  }, [selectedOption?.modalities]);
  const [behaviorSelection, setBehaviorSelection] = useState<{
    behavior: MessageBehavior;
    authoritativeConfirmationPolicy: MessageBehavior['confirmation_policy'];
    authoritativeExecutionMode: MessageBehavior['execution_mode'];
    authoritativeEffort: string | undefined;
    /** The person picked a level in this mount; a late session value never overrides it. */
    effortPicked: boolean;
  }>(() => ({
    behavior: {
      confirmation_policy: confirmationPolicy,
      execution_mode: executionMode,
      // The person's explicit choice only; the model's own default fills in below.
      reasoning_effort: knownReasoningEffort(effort),
    },
    authoritativeConfirmationPolicy: confirmationPolicy,
    authoritativeExecutionMode: executionMode,
    authoritativeEffort: effort,
    effortPicked: false,
  }));
  const behavior: MessageBehavior = {
    ...behaviorSelection.behavior,
    confirmation_policy:
      behaviorSelection.authoritativeConfirmationPolicy === confirmationPolicy
        ? behaviorSelection.behavior.confirmation_policy
        : confirmationPolicy,
    execution_mode:
      behaviorSelection.authoritativeExecutionMode === executionMode
        ? behaviorSelection.behavior.execution_mode
        : executionMode,
    reasoning_effort:
      behaviorSelection.effortPicked || behaviorSelection.authoritativeEffort === effort
        ? behaviorSelection.behavior.reasoning_effort
        : // A changed session effort is the person's own (the service projects
          // only user-sourced levels); absent means nothing is picked.
          knownReasoningEffort(effort),
  };
  const setBehavior = (next: MessageBehavior, effortPicked = behaviorSelection.effortPicked) => {
    const previous = behavior;
    setBehaviorSelection({
      behavior: next,
      authoritativeConfirmationPolicy: confirmationPolicy,
      authoritativeExecutionMode: executionMode,
      authoritativeEffort: effort,
      effortPicked,
    });
    if (
      !onBehaviorChange ||
      (next.execution_mode === previous.execution_mode &&
        next.confirmation_policy === previous.confirmation_policy)
    ) {
      return;
    }
    void onBehaviorChange(next).catch((error: unknown) => {
      setBehaviorSelection({
        behavior: previous,
        authoritativeConfirmationPolicy: confirmationPolicy,
        authoritativeExecutionMode: executionMode,
        authoritativeEffort: effort,
        effortPicked: behaviorSelection.effortPicked,
      });
      toast.error('Session behavior was not changed', {
        description: error instanceof Error ? error.message : 'The service rejected the change.',
      });
    });
  };
  // Kept apart from `behavior`, which must always carry a value the message
  // contract accepts. The control names this rather than showing the default as
  // though the service had asked for it.
  const unrecognizedEffort = effort && !knownReasoningEffort(effort) ? effort : undefined;
  const [uploadProgress, setUploadProgress] = useState<ResourceUploadProgress>();
  const [fileUploadOpen, setFileUploadOpen] = useState(false);
  const [internalReferences, setInternalReferences] = useState<readonly InlineReferenceSelection[]>(
    [],
  );
  const selectedReferences = references ?? internalReferences;
  const setSelectedReferences = useCallback(
    (next: readonly InlineReferenceSelection[]) => {
      if (references === undefined) setInternalReferences(next);
      onReferencesChange?.(next);
    },
    [onReferencesChange, references],
  );
  const [uploadFailure, setUploadFailure] = useState<ResourceUploadFailure>();
  // The attachment in flight when a submit is rejected; the progress state is
  // cleared on the way out, so the name is kept separately.
  const uploadingFilenameRef = useRef<string>(undefined);
  const nextDeliveryRef = useRef<MessageDelivery>(state === 'running' ? 'steer' : 'start');
  const [internalInput, setInternalInput] = useState('');
  const input = value ?? internalInput;
  const latestInputRef = useRef(input);
  const lastInsertedDraftRef = useRef<{ sourceKey: string; text: string } | undefined>(undefined);
  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);
  const setInput = useCallback(
    (nextValue: string) => {
      latestInputRef.current = nextValue;
      if (value === undefined) setInternalInput(nextValue);
      onValueChange?.(nextValue);
    },
    [onValueChange, value],
  );
  useEffect(() => {
    const useDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; sourceKey?: string }>).detail;
      if (typeof detail?.text !== 'string') return;
      const current = latestInputRef.current;
      const previous = lastInsertedDraftRef.current;
      const replacePrevious =
        previous && detail.sourceKey === previous.sourceKey && current.includes(previous.text);
      setInput(
        replacePrevious
          ? current.replace(previous.text, detail.text)
          : current
            ? `${current}\n\n${detail.text}`
            : detail.text,
      );
      if (detail.sourceKey)
        lastInsertedDraftRef.current = { sourceKey: detail.sourceKey, text: detail.text };
      window.requestAnimationFrame(() => focusComposerEditor(inputRef.current));
    };
    window.addEventListener('clio:use-message-draft', useDraft);
    return () => {
      window.removeEventListener('clio:use-message-draft', useDraft);
    };
  }, [input, setInput]);
  useRegionCaptureAnnotation(annotations, onAnnotationsChange);
  const inputRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handledFocusRequestKeyRef = useRef(focusRequestKey);
  const restoreFocusAfterSubmitRef = useRef(false);
  const focusEditorSoon = useCallback((offset?: number) => {
    window.requestAnimationFrame(() => focusComposerEditor(inputRef.current, offset));
  }, []);

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
  const commandPopoverId = `${useId()}-composer-commands`;
  const sourceAttachments = useComposerSourceAttachments(
    selectedReferences,
    setSelectedReferences,
    workspaceId,
  );
  const composerReferences = useComposerReferenceController({
    contextReferences,
    editorRef: inputRef,
    focusEditor: focusEditorSoon,
    input,
    selectedReferences: sourceAttachments.inlineReferences,
    setInput,
    setSelectedReferences: sourceAttachments.setInlineReferences,
    workspaceId,
  });
  const showReferences = composerReferences.open;
  const connectedSources = useComposerSources(
    workspaceId,
    (reference) =>
      isSourceAttachment(reference)
        ? sourceAttachments.add(reference)
        : composerReferences.select(reference),
    attachments ? () => setFileUploadOpen(true) : undefined,
    sessionId,
  );
  const popoverOpen = showCommands || showReferences;
  // Send an explicit supported pick; the service applies configured defaults.
  const messageBehavior: MessageBehavior = {
    ...behavior,
    reasoning_effort: effectiveReasoningEffort(
      behavior.reasoning_effort,
      selectedOption?.reasoning,
    ),
  };

  useEffect(() => {
    const previousKey = handledFocusRequestKeyRef.current;
    handledFocusRequestKeyRef.current = focusRequestKey;
    if (focusRequestKey === undefined || focusRequestKey === previousKey) return;
    const frame = window.requestAnimationFrame(() => focusComposerEditor(inputRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestKey]);

  useEffect(() => {
    if (disabled || !restoreFocusAfterSubmitRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element || element.getAttribute('aria-disabled') === 'true') return;
      restoreFocusAfterSubmitRef.current = false;
      focusComposerEditor(element);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [disabled]);

  const restoreInputFocusWhenReady = () => {
    window.requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element || element.getAttribute('aria-disabled') === 'true') return;
      restoreFocusAfterSubmitRef.current = false;
      focusComposerEditor(element);
    });
  };

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (variant !== 'docked' || !element || !onHeightChange) return;
    // Layout animations transform the composer visually while it moves. Measure
    // its layout box so the transcript inset never captures a transient scale.
    const reportHeight = () => onHeightChange(Math.ceil(element.offsetHeight));
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
              'clio-composer-docked pointer-events-none flex max-h-full min-h-0 flex-col px-4 pb-3 [&>*]:pointer-events-auto lg:px-6',
              showCommands || showReferences ? 'overflow-visible' : 'overflow-hidden',
            )
          : 'w-full',
      )}
      ref={rootRef}
    >
      {showCommands ? (
        <div
          className="absolute inset-x-4 bottom-full z-20 mx-auto max-w-4xl pb-2 lg:inset-x-6"
          id={commandPopoverId}
        >
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
                      window.requestAnimationFrame(() => focusComposerEditor(inputRef.current));
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
        <div
          className="absolute inset-x-4 bottom-full z-20 mx-auto max-w-4xl pb-2 lg:inset-x-6"
          id={composerReferences.popoverId}
        >
          <ClioComposerReferenceMenu
            activeReferenceId={composerReferences.activeReferenceId}
            onActiveOptionChange={composerReferences.onActiveOptionChange}
            onActiveReferenceChange={composerReferences.onActiveReferenceChange}
            onDismiss={composerReferences.dismiss}
            onReferencesChange={composerReferences.onOptionsChange}
            onRestoreFocus={composerReferences.restoreEditorFocus}
            onSelect={composerReferences.select}
            onQueryChange={composerReferences.onQueryChange}
            query={composerReferences.query}
            searchInput={composerReferences.pickerOpen}
            workspaceId={workspaceId}
          />
        </div>
      ) : null}
      {pendingInteractions}
      {connectedSources.picker}
      {queuedMessages.length > 0 &&
      onDeleteQueuedMessage &&
      onPromoteQueuedMessage &&
      onReorderQueuedMessages &&
      onUpdateQueuedMessage ? (
        <ClioComposerQueue
          busy={queueBusy}
          paused={queuePaused}
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
        data-slot="clio-composer"
        className="mx-auto max-w-4xl shrink-0 rounded-2xl bg-composer shadow-sm"
        maxFileSize={250 * 1024 * 1024}
        multiple
        onError={(error) => toast.error('Attachment was not added', { description: error.message })}
        onSubmit={async ({ files, text }) => {
          if (connectedSources.pending)
            throw new Error('Wait for the folder attachment or remove it before sending.');
          const trimmed = text.trim();
          if (trimmed || files.length > 0 || selectedReferences.length > 0 || annotations.length) {
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
                if (latestInputRef.current.trim() === trimmed) setInput('');
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
                behavior: messageBehavior,
                delivery: state === 'running' ? nextDeliveryRef.current : 'start',
                files,
                references: selectedReferences.map(({ reference }) => toMessagePart(reference)),
                text: messageTextWithAnnotations(annotations, trimmed),
                provider: selectedOption?.providerId,
                model: selectedOption?.id,
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
            nextDeliveryRef.current = state === 'running' ? 'steer' : 'start';
            await sourceAttachments.keep();
            if (latestInputRef.current.trim() === trimmed) setInput('');
            setSelectedReferences([]);
            onAnnotationsChange?.([]);
            window.dispatchEvent(new Event('clio:message-sent'));
          }
        }}
      >
        <ClioComposerFileUpload
          enabled={attachments}
          onOpenChange={setFileUploadOpen}
          open={fileUploadOpen}
          onFolderFiles={connectedSources.drop}
        />
        <ClioComposerAttachments
          annotations={annotations}
          onRemoveCapture={(gone) =>
            onAnnotationsChange?.(annotations.filter((item) => item !== gone))
          }
          onPrepareFiles={onPrepareFiles}
          onDiscardFiles={onDiscardFiles}
          resources={resources}
          uploadFailure={uploadFailure}
          uploadProgress={uploadProgress}
        />
        {sourceAttachments.tray(onOpenReference, connectedSources.openReference)}
        {connectedSources.attachments}
        {uploadProgress ? (
          <div className="px-3 pt-1 text-xs text-muted-foreground" role="status">
            Uploading {uploadProgress.filename}{' '}
            {uploadProgress.total > 0
              ? `${Math.round((uploadProgress.loaded / uploadProgress.total) * 100)}%`
              : ''}
          </div>
        ) : null}
        <ClioComposerAnnotations
          annotations={annotations.filter((annotation) => annotation.kind !== 'region-capture')}
          onRemove={(gone) => onAnnotationsChange?.(annotations.filter((item) => item !== gone))}
        />
        <ComposerInlineReferenceEditor
          activeOptionId={composerReferences.activeOptionId}
          disabled={disabled}
          expanded={popoverOpen}
          onCaretChange={composerReferences.onCaretChange}
          onChange={setInput}
          onOpenReference={onOpenReference}
          onReferencesChange={sourceAttachments.setInlineReferences}
          placeholder={`Ask ${brand.name} to investigate, build, explain, or act…`}
          popoverId={showCommands ? commandPopoverId : composerReferences.popoverId}
          ref={inputRef}
          references={sourceAttachments.inlineReferences}
          value={input}
          onKeyDown={(event) => {
            if (composerReferences.handleKeyDown(event)) return;
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            const form = event.currentTarget.closest('form');
            const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
            if (submit?.disabled) return;
            nextDeliveryRef.current = state === 'running' ? 'steer' : 'start';
            form?.requestSubmit();
          }}
        />
        <PromptInputFooter className="@container/composer flex-wrap gap-y-1">
          <PromptInputTools className="min-w-0 flex-wrap">
            {attachments || contextReferences ? (
              <ComposerAddContextButton
                attachments={attachments}
                contextReferences={contextReferences}
                onOpenFileUpload={() => setFileUploadOpen(true)}
                onOpenSources={connectedSources.open}
                onOpenReferences={composerReferences.openPicker}
              />
            ) : null}
            <ClioComposerBehaviorControls
              behavior={messageBehavior}
              spotterAvailability={spotterAvailability}
              reasoningLevels={selectedOption?.reasoning?.levels ?? []}
              defaultEffortLabel={defaultReasoningLabel(
                configuredEffort,
                selectedOption?.reasoning,
              )}
              disabled={disabled}
              modelControl={
                <ClioModelPicker
                  catalogStatus={modelCatalogStatus}
                  model={selectedOption?.id}
                  onChange={(option) => {
                    selectModel(option);
                    // Drop a pick the new model does not offer (its default is shown).
                    const pick = behavior.reasoning_effort;
                    if (pick && !option.reasoning?.levels.includes(pick)) {
                      setBehaviorSelection({
                        behavior: { ...behavior, reasoning_effort: undefined },
                        authoritativeConfirmationPolicy: confirmationPolicy,
                        authoritativeExecutionMode: executionMode,
                        authoritativeEffort: effort,
                        effortPicked: false,
                      });
                    }
                  }}
                  onRetryCatalog={onRetryModelCatalog}
                  options={modelOptions}
                  provider={selectedOption?.providerId}
                  trigger={
                    <Button
                      aria-label="Change model"
                      className="max-w-32 text-foreground @min-[48rem]/composer:max-w-48"
                      size="sm"
                      title="Change model"
                      type="button"
                      variant="outline"
                    >
                      {selectedOption ? (
                        <ModelSelectorLogo provider={providerLogoId(selectedOption.providerId)} />
                      ) : null}
                      <span className="truncate">
                        {selectedOption ? composerModelLabel(selectedOption) : 'Choose model'}
                      </span>
                    </Button>
                  }
                />
              }
              onChange={(next) => {
                // Keep only an effort the person picked: a mode or approval
                // change must not freeze the displayed default as a choice.
                const picked = next.reasoning_effort !== messageBehavior.reasoning_effort;
                setBehavior(
                  {
                    ...next,
                    reasoning_effort: picked ? next.reasoning_effort : behavior.reasoning_effort,
                  },
                  picked || behaviorSelection.effortPicked,
                );
              }}
              unrecognizedEffort={unrecognizedEffort}
            />
          </PromptInputTools>
          <ClioComposerEvidenceControls
            activityControl={activityControl}
            workSummary={workSummary}
          />
          <div className="flex shrink-0 items-center gap-2">
            {catalogPreparing && state !== 'running' ? (
              <span className="text-xs text-muted-foreground" role="status">
                Preparing views…
              </span>
            ) : null}
            {state === 'running' ? (
              <PromptInputButton
                aria-label="Steer current work"
                className="gap-1.5 border-action/40 text-action hover:bg-action/10 hover:text-action"
                disabled={
                  disabled ||
                  connectedSources.pending ||
                  (!input.trim() && selectedReferences.length === 0)
                }
                onClick={() => {
                  nextDeliveryRef.current = 'steer';
                }}
                title="Send feedback before the next model iteration"
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
              disabled={
                ((disabled || catalogPreparing) && state !== 'running') ||
                (connectedSources.pending && state !== 'running')
              }
              onStop={onStop}
              status={chatStatus(state)}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
