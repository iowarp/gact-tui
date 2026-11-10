import type {
  CommandDefinition,
  ComposerMessagePart,
  MessageBehavior,
  MessageDelivery,
  RunState,
  WorkspaceReference,
  SummonTargets,
  WorkspaceResource,
} from '@clio/core/v3';
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
import { useComposerBehavior } from '@/hooks/use-composer-behavior';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { brand } from '@brand';
import { PromptInput, PromptInputFooter } from '@/components/ai-elements/prompt-input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ComposerSubmitControls } from './composer-submit-controls';
import { composerDelivery } from '@/hooks/use-composer-delivery';
import { ComposerModelControl } from './composer-model-control';
import { ComposerToolbarStatus } from './composer-toolbar-status';
import { useComposerHeldSend } from './use-composer-held-send';
import { ModelFitNotice } from './model-fit-notice';
import { useComposerModelSelection } from './use-composer-model-selection';
import { useSpotterAvailability } from '@/hooks/use-spotter-availability';
import { useSpotterModelSelection } from '@/hooks/use-spotter-model-selection';
import { cn } from '@/lib/utils';
import { COMPOSER_ATTACHMENT_MAX_BYTES } from '@/lib/composer-paste';
import { formatBytes } from '@/lib/format';
import { compactModelName } from '@/lib/model-options';
import { useConnectionIndicatorState } from '@/hooks/use-connection-indicator-state';
import { composerFailureReason, humanFailureText } from './composer-failure';
import { ClioComposerAttachments, type ResourceUploadFailure } from './composer-attachments';
import { ClioComposerQueue, type ComposerQueueControls } from './composer-queue';
import { ClioComposerBehaviorControls } from './composer-behavior-controls';
import { ComposerSpotterModel } from './composer-spotter-model';
import { defaultReasoningLabel, type ModelReasoningLevels } from '@/lib/reasoning-levels';
import type {
  ResourceUploadProgress,
  UploadableFilePart,
  WorkspaceResourceUploadResult,
} from '@/lib/upload-workspace-resources';
import { ClioComposerCommandMenu, type CommandListState } from './composer-command-menu';
import { commandForName } from '@/lib/command-table';
import { ClioComposerReferenceMenu } from './composer-references';
import { useComposerReferenceController } from './composer-reference-controller';
import {
  summonReferences,
  toMessagePart,
  typedSummons,
  withReferenceMentions,
  type InlineReferenceSelection,
} from '@/lib/composer-reference-domain';
import { ComposerInlineReferenceEditor } from './composer-inline-reference-editor';
import { focusEditorAtOffset as focusComposerEditor } from './composer-editor-model';
import { ClioComposerFileUpload } from './composer-file-upload';
import { ClioComposerAnnotations } from './composer-annotations';
import { commentSessionParts } from '@/lib/composer-annotations';
import type { CommentAttachment } from '@clio/core/v3';
import { setModelImageInput } from '@/lib/model-image-input';
import { useCommentSessionAttachment } from './comments/use-comment-session-attachment';
import { ComposerAddContextButtons } from './composer-add-context-button';
import { ClioComposerEvidenceControls } from './composer-evidence-controls';
import { useComposerSources } from './use-composer-sources';
import { registerComposerReferenceTarget } from '@/lib/composer-reference-requests';
import {
  isSourceAttachment,
  useComposerSourceAttachments,
} from './use-composer-source-attachments';
import { useSummonTargets } from '@/hooks/use-summon-targets';
import {
  deleteSavedDraft,
  saveDraft,
  takeSavedDraft,
  useSavedDrafts,
} from '@/lib/composer-saved-drafts';

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
  /** A send is out and the service hasn't taken it yet; a slow one says so in the row. */
  sending?: boolean;
  /**
   * The connection's defaults are still loading. The draft stays editable; the
   * controls and the send wait, and an Enter pressed meanwhile sends once ready.
   */
  connecting?: boolean;
  /** Keep the draft editable while the first session catalog is registering. */
  catalogPreparing?: boolean;
  contextReferences?: boolean;
  /**
   * The service's capabilities are still loading, so `attachments` and
   * `contextReferences` aren't known yet. `+` and `@` hold their place, disabled.
   */
  capabilitiesPending?: boolean;
  workspaceId?: string;
  sessionId?: string;
  commands?: CommandDefinition[];
  /** Whether `commands` is the agent's list yet (default `ready`). */
  commandsState?: CommandListState;
  /** The subagents and MCP servers the person can `@`-summon (fetched for the session if absent). */
  summonTargets?: SummonTargets;
  onSubmit: (value: {
    text: string;
    files: UploadableFilePart[];
    references: Exclude<ComposerMessagePart, { type: 'text' }>[];
    provider?: string;
    model?: string;
    delivery: MessageDelivery | 'queued';
    behavior: MessageBehavior;
    onUploadProgress: (progress: ResourceUploadProgress) => void;
    /** The fleet model (`<account>/<model>`) SPOTTER review runs on in a new conversation. */
    spotterModel?: string;
  }) => Promise<void>;
  onBehaviorChange?: (behavior: MessageBehavior) => Promise<void>;
  spotterModel?: string;
  /** Stores the session's SPOTTER model (empty: conversation model); else the draft keeps it. */
  onSpotterModelChange?: (ref: string) => Promise<void>;
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
  /** Comment sessions attached to the next message (answers, A2UI views, pages). */
  annotations?: readonly CommentAttachment[];
  onAnnotationsChange?: (annotations: readonly CommentAttachment[]) => void;
  focusRequestKey?: number;
  /**
   * Place the caret in the editor on mount when nothing else holds focus. Skipped
   * on touch screens so arriving on the page doesn't raise the on-screen keyboard.
   */
  autoFocus?: boolean;
  variant?: 'docked' | 'welcome';
  /**
   * Hint shown in the empty editor. Defaults to steering copy in a conversation
   * and to the open invitation on the welcome page.
   */
  placeholder?: string;
}

const noQueueAction = async () => undefined;

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
  sending = false,
  connecting = false,
  catalogPreparing = false,
  contextReferences = false,
  capabilitiesPending = false,
  workspaceId = '',
  sessionId,
  commands = [],
  commandsState = 'ready',
  summonTargets: summonTargetsProp,
  onSubmit,
  onBehaviorChange,
  spotterModel = '',
  onSpotterModelChange,
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
  autoFocus = false,
  variant = 'docked',
  placeholder = variant === 'welcome'
    ? `Ask ${brand.name} anything, or describe a task…`
    : state === 'running' || state === 'queued'
      ? 'Reply, or steer the run'
      : 'Reply',
}: ClioComposerProps) {
  const spotterAvailability = useSpotterAvailability(workspaceId);
  const {
    missing: missingModel,
    selectedOption,
    selectModel,
  } = useComposerModelSelection(modelOptions, provider, model, connecting);
  // Never a bare "Choose a model" when we know why there is none.
  const modelProblem =
    modelCatalogStatus === 'error' && !selectedOption
      ? {
          label: 'Models unavailable',
          detail: "The model list couldn't be loaded. Open the picker to retry.",
        }
      : modelCatalogStatus === 'ready' && missingModel
        ? {
            label: `${compactModelName(missingModel.modelId, missingModel.modelId)} unavailable`,
            detail: `${humanFailureText(missingModel.reason) ?? `${missingModel.modelId} isn't available right now.`} Choose another model.`,
          }
        : undefined;
  useEffect(() => {
    setModelImageInput(Boolean(selectedOption?.modalities?.includes('image')));
  }, [selectedOption?.modalities]);
  const { messageBehavior, unrecognizedEffort, choose, keepOfferedEffort } = useComposerBehavior({
    confirmationPolicy,
    executionMode,
    effort,
    reasoning: selectedOption?.reasoning,
    onBehaviorChange,
  });
  const spotter = useSpotterModelSelection(spotterModel, onSpotterModelChange);
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
  const nextDeliveryRef = useRef<MessageDelivery | 'queued' | undefined>(undefined);
  const controlsDisabled = disabled || connecting;
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
  useCommentSessionAttachment(annotations, onAnnotationsChange);
  const inputRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // While the service can't be reached or the stream is opening, resuming or catching up,
  // the draft stays editable and Enter holds the send until it is live again, like a send
  // typed while connecting. The run state is only current on a live stream, so a send
  // never picks its delivery from a stale one.
  const stream = useConnectionIndicatorState();
  // A send the service is slow to take greys the draft; the row says why. The flag comes
  // from the send itself, so it survives the welcome composer handing off to the docked one.
  const [sendingSlow, setSendingSlow] = useState(false);
  useEffect(() => {
    if (!sending) {
      setSendingSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSendingSlow(true), 700);
    return () => window.clearTimeout(timer);
  }, [sending]);
  const offline = stream === 'offline' || stream === 'reconnecting' || stream === 'gapped';
  const streamOpening = stream === 'connecting';
  const awaitingService = connecting || offline || streamOpening;
  const heldSend = useComposerHeldSend(awaitingService, rootRef, nextDeliveryRef);
  const retrySend = (delivery: MessageDelivery | 'queued' | undefined) => {
    const form = rootRef.current?.querySelector('form');
    const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!form || !submit) return;
    if (submit.disabled) {
      if (awaitingService) heldSend.hold(delivery ?? composerDelivery(state, false));
      return;
    }
    nextDeliveryRef.current = delivery;
    form.requestSubmit();
  };
  const attachmentRefused = (error: { code: string; message: string; files?: string[] }) => {
    if (error.code === 'max_file_size') {
      const [first, ...rest] = error.files ?? [];
      toast.error(
        first && rest.length === 0
          ? `${first} is too large`
          : `${error.files?.length ?? 'Some'} files are too large`,
        { description: `Files up to ${formatBytes(COMPOSER_ATTACHMENT_MAX_BYTES)} can be attached.` },
      );
      return;
    }
    toast.error('Attachment was not added', { description: error.message });
  };
  const handledFocusRequestKeyRef = useRef(focusRequestKey);
  const restoreFocusAfterSubmitRef = useRef(false);
  const focusEditorSoon = useCallback((offset?: number) => {
    window.requestAnimationFrame(() => focusComposerEditor(inputRef.current, offset));
  }, []);

  const fetchedTargets = useSummonTargets(summonTargetsProp ? '' : (sessionId ?? ''));
  const summonTargets = summonTargetsProp ?? fetchedTargets;
  const summonRows = useMemo(() => summonReferences(summonTargets), [summonTargets]);
  const commandQuery = input.trimStart();
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
  const [commandMenuOpen, setCommandMenuOpen] = useState(true);
  const popoverOpen = (showCommands && commandMenuOpen) || showReferences;
  // Esc (or ⌘ . on a Mac) stops the run while focus is in the composer or its queue.
  useShortcut('stop', () => onStop?.(), {
    enabled: Boolean(onStop) && (state === 'running' || state === 'queued'),
    region: rootRef,
  });
  // Ctrl+S (⌘S) puts the draft aside in the dash; Up in an empty editor brings
  // the newest back. Restoring over a draft puts that one aside first.
  const savedDraftKey = sessionId ?? `new:${workspaceId}`;
  const savedDrafts = useSavedDrafts(savedDraftKey);
  const draftEmpty = !input.trim() && selectedReferences.length === 0;
  const putDraftAside = () => {
    const saved = saveDraft(savedDraftKey, {
      text: latestInputRef.current,
      references: selectedReferences,
    });
    if (!saved) return;
    setInput('');
    setSelectedReferences([]);
  };
  const restoreSavedDraft = (id?: string) => {
    const draft = takeSavedDraft(savedDraftKey, id);
    if (!draft) return;
    saveDraft(savedDraftKey, { text: latestInputRef.current, references: selectedReferences });
    setInput(draft.text);
    setSelectedReferences(draft.references);
    focusEditorSoon();
  };
  useShortcut('save-draft', putDraftAside, {
    enabled: !disabled,
    region: rootRef,
    allowInTextField: true,
  });
  useShortcut('restore-draft', () => restoreSavedDraft(), {
    enabled: !disabled && draftEmpty && savedDrafts.length > 0,
    region: inputRef,
    allowInTextField: true,
  });
  useShortcut('composer-focus', () => focusComposerEditor(inputRef.current), {
    enabled: !disabled,
  });
  const addReferenceRef = useRef<(reference: WorkspaceReference) => void>(() => undefined);
  useEffect(() => {
    addReferenceRef.current = (reference) =>
      isSourceAttachment(reference)
        ? sourceAttachments.add(reference)
        : composerReferences.select(reference);
  });
  useEffect(() => {
    if (!contextReferences || !workspaceId) return undefined;
    return registerComposerReferenceTarget({
      workspaceId,
      add: (reference) => addReferenceRef.current(reference),
    });
  }, [contextReferences, workspaceId]);

  useEffect(() => {
    const previousKey = handledFocusRequestKeyRef.current;
    handledFocusRequestKeyRef.current = focusRequestKey;
    if (focusRequestKey === undefined || focusRequestKey === previousKey) return;
    const frame = window.requestAnimationFrame(() => focusComposerEditor(inputRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestKey]);

  const autoFocusRef = useRef(autoFocus);
  useEffect(() => {
    if (!autoFocusRef.current) return undefined;
    if (window.matchMedia?.('(pointer: coarse)').matches) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      focusComposerEditor(inputRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
              'clio-composer-docked pointer-events-none flex max-h-full min-h-0 flex-col pb-3 *:pointer-events-auto *:max-w-none',
              showCommands || showReferences ? 'overflow-visible' : 'overflow-hidden',
            )
          : 'w-full',
      )}
      ref={rootRef}
    >
      {showCommands ? (
        <ClioComposerCommandMenu
          commands={commands}
          commandsState={commandsState}
          onPick={(command) => {
            setInput(`${command.id} `);
            window.requestAnimationFrame(() => focusComposerEditor(inputRef.current));
          }}
          onRun={(command) => {
            setInput(command.id);
            // The form reads the committed text, so submit on the next frame.
            window.requestAnimationFrame(() => {
              const form = rootRef.current?.querySelector('form');
              const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
              if (!form || submit?.disabled) return;
              nextDeliveryRef.current = composerDelivery(state, false);
              form.requestSubmit();
            });
          }}
          onOpenChange={setCommandMenuOpen}
          popoverId={commandPopoverId}
          query={commandQuery}
        />
      ) : null}
      {showReferences && !showCommands ? (
        // Portals into the overlay container above the composer box; the popup
        // carries `popoverId`, the editor's aria-controls target.
        <ClioComposerReferenceMenu
          handleRef={composerReferences.menuRef}
          key={composerReferences.pickerOpen ? 'picker' : 'mention'}
          onDismiss={composerReferences.dismiss}
          onRestoreFocus={composerReferences.restoreEditorFocus}
          onSelect={composerReferences.select}
          popoverId={composerReferences.popoverId}
          query={composerReferences.query}
          searchInput={composerReferences.pickerOpen}
          summons={summonRows}
          workspaceId={workspaceId}
        />
      ) : null}
      {pendingInteractions}
      {connectedSources.picker}
      {(queuedMessages.length > 0 &&
        onDeleteQueuedMessage &&
        onPromoteQueuedMessage &&
        onReorderQueuedMessages &&
        onUpdateQueuedMessage) ||
      savedDrafts.length > 0 ? (
        <ClioComposerQueue
          busy={queueBusy}
          paused={queuePaused}
          messages={
            onDeleteQueuedMessage &&
            onPromoteQueuedMessage &&
            onReorderQueuedMessages &&
            onUpdateQueuedMessage
              ? queuedMessages
              : []
          }
          onDelete={onDeleteQueuedMessage ?? noQueueAction}
          onDeleteSavedDraft={(draft) => deleteSavedDraft(savedDraftKey, draft.id)}
          onOpenResource={onOpenResource}
          onPromote={onPromoteQueuedMessage ?? noQueueAction}
          onReorder={onReorderQueuedMessages ?? noQueueAction}
          onRestoreSavedDraft={(draft) => restoreSavedDraft(draft.id)}
          onUpdate={onUpdateQueuedMessage ?? noQueueAction}
          promoteDelivery={state === 'running' ? 'steer' : 'start'}
          resources={resources}
          savedDrafts={savedDrafts}
        />
      ) : null}
      <PromptInput
        data-evidence-composer
        data-slot="clio-composer"
        className="mx-auto w-full max-w-4xl shrink-0 [&>[data-slot=input-group]]:rounded-[12px] [&>[data-slot=input-group]]:pt-[14px] [&>[data-slot=input-group]]:pr-[10px] [&>[data-slot=input-group]]:pb-[8px] [&>[data-slot=input-group]]:pl-[14px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]>*]:px-0"
        maxFileSize={COMPOSER_ATTACHMENT_MAX_BYTES}
        multiple
        onError={(error) => attachmentRefused(error)}
        onSubmit={async ({ files, text }) => {
          if (connectedSources.pending)
            throw new Error('Wait for the folder attachment or remove it before sending.');
          const trimmed = text.trim();
          if (trimmed || files.length > 0 || selectedReferences.length > 0 || annotations.length) {
            if (trimmed.startsWith('/')) {
              const [enteredId = '', ...parts] = trimmed.split(/\s+/);
              const { command, qualified } = commandForName(commands, enteredId);
              if (qualified) {
                toast.error(`${enteredId} is ambiguous; use ${qualified.join(' or ')}`);
                return;
              }
              if (!command) {
                toast.error(`${enteredId} is not a command here`);
                return;
              }
              if (!command.enabled) {
                toast.error(`${command.title} is unavailable`, {
                  description: command.disabled_detail || command.disabled_reason,
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
                  description: composerFailureReason(error, 'The service rejected it.'),
                });
                throw error;
              } finally {
                restoreInputFocusWhenReady();
              }
              return;
            }
            const picked = selectedReferences.map(({ reference }) => toMessagePart(reference));
            restoreFocusAfterSubmitRef.current = true;
            setUploadFailure(undefined);
            uploadingFilenameRef.current = undefined;
            try {
              await onSubmit({
                behavior: messageBehavior,
                delivery:
                  state !== 'running'
                    ? 'start'
                    : // A send held from before the run began queues behind it.
                      nextDeliveryRef.current && nextDeliveryRef.current !== 'start'
                      ? nextDeliveryRef.current
                      : 'queued',
                files,
                references: [
                  ...picked,
                  // An `@name` typed in full that exactly names a summon target is one too.
                  ...typedSummons(text, summonTargets, picked),
                  ...commentSessionParts(annotations),
                ],
                // Each typed reference stays where it was typed, as `@path` /
                // `@label`; attached sources live in the tray, not the sentence.
                text: withReferenceMentions(text, sourceAttachments.inlineReferences).trim(),
                provider: selectedOption?.providerId,
                model: selectedOption?.id,
                onUploadProgress: (progress) => {
                  uploadingFilenameRef.current = progress.filename;
                  setUploadProgress(progress);
                },
                ...(variant === 'welcome' &&
                spotter.value &&
                messageBehavior.confirmation_policy === 'spotter-ai'
                  ? { spotterModel: spotter.value }
                  : {}),
              });
            } catch (error) {
              const reason = composerFailureReason(error, 'The service rejected it.');
              const failedFile = uploadingFilenameRef.current;
              const retryDelivery = nextDeliveryRef.current;
              setUploadProgress(undefined);
              setUploadFailure({ filename: failedFile, message: reason });
              toast.error(
                failedFile
                  ? `${failedFile} could not be uploaded`
                  : state === 'running'
                    ? 'Message was not accepted'
                    : 'Message was not sent',
                {
                  description: `${reason} Your message is still here.`,
                  action: { label: 'Retry', onClick: () => retrySend(retryDelivery) },
                },
              );
              throw error;
            } finally {
              setUploadProgress(undefined);
              restoreInputFocusWhenReady();
            }
            nextDeliveryRef.current = undefined;
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
        {sessionId ? (
          <ModelFitNotice
            modelId={selectedOption?.id}
            providerId={selectedOption?.providerId}
            sessionId={sessionId}
          />
        ) : null}
        <ClioComposerAnnotations
          annotations={annotations}
          onChange={(next) => onAnnotationsChange?.(next)}
        />
        <ComposerInlineReferenceEditor
          attachmentsEnabled={attachments}
          activeOptionId={composerReferences.activeOptionId}
          ariaLabel={`Ask ${brand.name}`}
          className="min-h-6 p-0 text-[13px] leading-6"
          disabled={disabled}
          expanded={popoverOpen}
          onCaretChange={composerReferences.onCaretChange}
          onChange={setInput}
          onOpenReference={onOpenReference}
          onReferencesChange={sourceAttachments.setInlineReferences}
          placeholder={placeholder}
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
            // No submit square (Stop shows while work runs with nothing typed): nothing to send.
            if (!submit || submit.disabled) {
              const delivery = composerDelivery(state, event.ctrlKey || event.metaKey);
              if (submit && awaitingService && !draftEmpty) heldSend.hold(delivery);
              return;
            }
            nextDeliveryRef.current = composerDelivery(state, event.ctrlKey || event.metaKey);
            form?.requestSubmit();
          }}
        />
        <TooltipProvider delayDuration={450}>
          <PromptInputFooter
            className="@container/composer mt-3 -ml-1.5 min-h-[30px] w-[calc(100%+0.375rem)] min-w-0 cursor-default flex-nowrap justify-start gap-[2px] p-0 font-normal group-has-[>input]/input-group:pb-0"
            data-slot="composer-toolbar"
          >
            {attachments || contextReferences || capabilitiesPending ? (
              <ComposerAddContextButtons
                attachments={attachments}
                contextReferences={contextReferences}
                pending={capabilitiesPending}
                sourcesPending={connectedSources.probing}
                disabled={controlsDisabled}
                onOpenSources={connectedSources.open}
                onOpenReferences={composerReferences.openPicker}
                onReturnFocus={focusEditorSoon}
              />
            ) : null}
            <ClioComposerBehaviorControls
              behavior={messageBehavior}
              beforeModel={
                <ClioComposerEvidenceControls
                  activityControl={activityControl}
                  workSummary={workSummary}
                />
              }
              spotterAvailability={spotterAvailability}
              spotterModelControl={
                <ComposerSpotterModel
                  catalogStatus={modelCatalogStatus}
                  disabled={controlsDisabled}
                  onChange={spotter.set}
                  onRetryCatalog={onRetryModelCatalog}
                  options={modelOptions}
                  value={spotter.value}
                />
              }
              reasoningLevels={selectedOption?.reasoning?.levels ?? []}
              reasoningPending={
                (connecting || modelCatalogStatus === 'loading') &&
                !selectedOption?.reasoning?.levels?.length
              }
              defaultEffortLabel={defaultReasoningLabel(
                configuredEffort,
                selectedOption?.reasoning,
              )}
              disabled={controlsDisabled}
              modelControl={
                <ComposerModelControl
                  catalogStatus={modelCatalogStatus}
                  onChange={(option) => {
                    selectModel(option);
                    keepOfferedEffort(option.reasoning);
                  }}
                  onRetryCatalog={onRetryModelCatalog}
                  options={modelOptions}
                  problem={modelProblem}
                  returnFocus={focusEditorSoon}
                  selected={selectedOption}
                />
              }
              onChange={choose}
              onReturnFocus={focusEditorSoon}
              unrecognizedEffort={unrecognizedEffort}
            />
            <ComposerToolbarStatus
              connecting={connecting || (streamOpening && heldSend.held)}
              held={heldSend.held}
              offline={offline}
              sending={sendingSlow && !uploadProgress}
              preparing={catalogPreparing && state !== 'running'}
            />
            <ComposerSubmitControls
              state={state}
              hasContent={Boolean(input.trim() || selectedReferences.length || annotations.length)}
              disabled={
                controlsDisabled ||
                offline ||
                streamOpening ||
                (catalogPreparing && state !== 'running') ||
                connectedSources.pending
              }
              onSubmit={(event) => {
                nextDeliveryRef.current = composerDelivery(state, event.ctrlKey || event.metaKey);
              }}
              onStop={onStop}
            />
          </PromptInputFooter>
        </TooltipProvider>{' '}
      </PromptInput>
    </div>
  );
}
