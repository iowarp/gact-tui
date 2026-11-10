import type {
  ComposerMessagePart,
  MessageDelivery,
  QueuedMessage,
  WorkspaceResource,
} from '@clio/core/v3';
import {
  CheckIcon,
  CircleAlertIcon,
  CornerDownRightIcon,
  GripVerticalIcon,
  SendIcon,
} from 'lucide-react';
import { createElement, useEffect, useRef, useState } from 'react';
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from '@/components/ai-elements/attachments';
import { SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import { Input } from '@/components/ui/input';
import { referenceKindLabel } from '@/lib/composer-reference-domain';
import { CloseIcon, DeleteIcon, EditIcon } from '@/lib/icon-vocabulary';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { humanFailureText } from './composer-failure';
import { referenceKindIcon } from './composer-reference-presentation';
import { IconButton } from './primitives/icon-button';
import { TruncatedText } from './primitives/truncate';
import { resourceAvailability, resourcePipelineStages } from './resource-availability';
import {
  ResourcePipelineStatusLines,
  ResourcePipelineSummaryIcon,
} from './resource-pipeline-status';

type ResourceRefPart = Extract<ComposerMessagePart, { type: 'resource_ref' }>;
type ContextRefPart = Extract<ComposerMessagePart, { type: 'context_ref' }>;

/** The name of the row's main verb, which follows the composer's delivery. */
function queuedPromoteLabel(delivery: MessageDelivery): string {
  return delivery === 'steer' ? 'Steer now' : 'Send now';
}

export interface QueuedMessageRowProps {
  message: QueuedMessage;
  busy?: boolean;
  /** The draft while this row is being edited; undefined otherwise. */
  editingText?: string;
  promoteDelivery: MessageDelivery;
  resourceById: ReadonlyMap<string, WorkspaceResource>;
  onOpenResource?: (resource: WorkspaceResource) => void;
  onStartEdit: (text: string) => void;
  onEditChange: (text: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
  onDelete: () => void;
  onPromote: () => void;
}

/**
 * One queued message on one 28px line: the reorder handle, the text cut to a
 * single line, a short summary of what travels with it, and its verbs. Edit
 * and Delete show on hover or focus; Send now (or Steer now) always shows.
 * Editing swaps the text for one field in the same line.
 */
export function QueuedMessageRow({
  busy = false,
  editingText,
  message,
  onCancelEdit,
  onDelete,
  onEditChange,
  onOpenResource,
  onPromote,
  onSaveEdit,
  onStartEdit,
  promoteDelivery,
  resourceById,
}: QueuedMessageRowProps) {
  const text = message.parts.find((part) => part.type === 'text')?.text ?? '';
  const resourceRefs = message.parts.filter(
    (part): part is ResourceRefPart => part.type === 'resource_ref',
  );
  const contextRefs = message.parts.filter(
    (part): part is ContextRefPart => part.type === 'context_ref',
  );
  const isEditing = editingText !== undefined;
  const promoteLabel = queuedPromoteLabel(promoteDelivery);
  const [showProblem, setShowProblem] = useState(false);
  const problem = promotionProblem(message.promotion_error);

  // Leaving the field would otherwise drop focus to the page; return it to
  // the row's Edit so the keyboard keeps its place in the queue.
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLLIElement>(null);
  const wasEditing = useRef(isEditing);
  useEffect(() => {
    if (wasEditing.current && !isEditing) {
      const active = document.activeElement;
      if (!active || active === document.body) editButtonRef.current?.focus();
    }
    wasEditing.current = isEditing;
  }, [isEditing]);

  // Delete (⌫ on a Mac) removes the row focus is in and keeps focus in the queue.
  useShortcut(
    'queue-delete',
    () => {
      const row = rowRef.current;
      const neighbour = row?.nextElementSibling ?? row?.previousElementSibling;
      if (neighbour instanceof HTMLElement) neighbour.focus();
      onDelete();
    },
    { enabled: !busy && !isEditing, region: rowRef },
  );

  return (
    <SortableItem asChild disabled={busy} role="listitem" tabIndex={-1} value={message.id}>
      <li
        className="group/queue-row flex min-w-0 flex-col rounded-[6px] hover:bg-hover focus-within:bg-hover"
        data-queue-live-item=""
        ref={rowRef}
      >
        <div className="flex h-7 min-w-0 items-center gap-1.5 pr-0.5 text-[13px] whitespace-nowrap">
          <SortableItemHandle asChild>
            <IconButton
              className="w-5 shrink-0 text-faint hover:bg-transparent hover:text-foreground"
              icon={<GripVerticalIcon />}
              label="Reorder queued message"
              size="sm"
            />
          </SortableItemHandle>
          {isEditing ? (
            <Input
              aria-label="Edit queued message"
              autoFocus
              className="h-6 flex-1 rounded-[5px] px-1.5 py-0 text-[13px] md:text-[13px] dark:bg-transparent"
              onChange={(event) => onEditChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  onCancelEdit();
                }
                if (event.key === 'Enter' && editingText.trim()) {
                  event.preventDefault();
                  onSaveEdit(editingText);
                }
              }}
              value={editingText}
            />
          ) : (
            <span className="flex min-w-0 flex-1">
              {text ? (
                <TruncatedText className="text-foreground">{text}</TruncatedText>
              ) : (
                <TruncatedText className="text-muted-foreground">
                  {contextRefs.length > 0 ? 'Context only' : 'Attachments only'}
                </TruncatedText>
              )}
            </span>
          )}
          {!isEditing && (contextRefs.length > 0 || resourceRefs.length > 0) ? (
            <span className="flex max-w-[45%] min-w-0 shrink items-center gap-2 text-[12px] text-muted-foreground">
              {contextRefs.length > 0 ? <QueuedReferenceSummary references={contextRefs} /> : null}
              {resourceRefs.length > 0 ? (
                <QueuedAttachmentSummary
                  onOpenResource={onOpenResource}
                  resourceById={resourceById}
                  resourceRefs={resourceRefs}
                />
              ) : null}
            </span>
          ) : null}
          {problem && !isEditing ? (
            <button
              aria-expanded={showProblem}
              className="flex h-6 shrink-0 items-center gap-1 rounded-[5px] px-1 text-[12px] font-medium text-destructive-text outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => setShowProblem((open) => !open)}
              title={problem}
              type="button"
            >
              <CircleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
              Not sent
            </button>
          ) : null}
          {isEditing ? (
            <span className="flex shrink-0 items-center gap-0.5">
              <IconButton
                disabled={busy || !editingText.trim()}
                icon={<CheckIcon />}
                label="Save"
                onClick={() => onSaveEdit(editingText)}
                size="sm"
              />
              <IconButton icon={<CloseIcon />} label="Cancel" onClick={onCancelEdit} size="sm" />
            </span>
          ) : (
            <>
              <span
                className="hidden shrink-0 items-center gap-0.5 group-hover/queue-row:flex group-focus-within/queue-row:flex pointer-coarse:flex"
                data-slot="queue-row-actions"
              >
                <IconButton
                  disabled={busy}
                  icon={<EditIcon />}
                  label="Edit"
                  onClick={() => onStartEdit(text)}
                  ref={editButtonRef}
                  size="sm"
                />
                <IconButton
                  disabled={busy}
                  icon={<DeleteIcon />}
                  label="Delete"
                  onClick={onDelete}
                  shortcut="queue-delete"
                  size="sm"
                />
              </span>
              <IconButton
                disabled={busy}
                icon={promoteDelivery === 'steer' ? <CornerDownRightIcon /> : <SendIcon />}
                label={promoteLabel}
                onClick={onPromote}
                size="sm"
              />
            </>
          )}
        </div>
        {problem && showProblem && !isEditing ? (
          <p className="pr-2 pb-1.5 pl-[26px] text-[12px] break-words whitespace-normal text-muted-foreground">
            {problem}
          </p>
        ) : null}
      </li>
    </SortableItem>
  );
}

/** Why the service did not start this message, as a sentence; never its raw payload. */
function promotionProblem(error: QueuedMessage['promotion_error']): string | undefined {
  if (!error) return undefined;
  const detail = error.detail as unknown;
  const said =
    typeof detail === 'string'
      ? detail
      : detail && typeof detail === 'object' && 'message' in detail
        ? String((detail as { message: unknown }).message)
        : undefined;
  const reason =
    error.status_code >= 500
      ? 'The service hit an error starting it.'
      : (humanFailureText(said) ?? 'The service did not start it.');
  return `${reason} Send it again, edit it or delete it.`;
}

/** The first reference by name and kind icon, then how many more travel with it. */
function QueuedReferenceSummary({ references }: { references: readonly ContextRefPart[] }) {
  const [first, ...rest] = references;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span
        className="inline-flex min-w-0 items-center gap-1"
        title={`${first.label} (${referenceKindLabel(first.ref_kind)})`}
      >
        {createElement(referenceKindIcon(first.ref_kind, first.label), {
          'aria-hidden': true,
          className: 'size-3 shrink-0',
        })}
        <span className="max-w-28 truncate">{first.label}</span>
      </span>
      {rest.length > 0 ? (
        <span
          className="shrink-0 tabular-nums"
          title={rest
            .map((reference) => `${reference.label} (${referenceKindLabel(reference.ref_kind)})`)
            .join(', ')}
        >
          +{rest.length}
          <span className="sr-only">{` more ${rest.length === 1 ? 'reference' : 'references'}`}</span>
        </span>
      ) : null}
    </span>
  );
}

/** The first attachment, openable with its pipeline state, then how many more. */
function QueuedAttachmentSummary({
  onOpenResource,
  resourceById,
  resourceRefs,
}: {
  onOpenResource?: (resource: WorkspaceResource) => void;
  resourceById: ReadonlyMap<string, WorkspaceResource>;
  resourceRefs: readonly ResourceRefPart[];
}) {
  const [first, ...rest] = resourceRefs;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <Attachments className="min-w-0 flex-nowrap gap-1" variant="inline">
        <QueuedResourceAttachment
          onOpen={onOpenResource}
          resource={resourceById.get(first.resource_id)}
          resourceRef={first}
        />
      </Attachments>
      {rest.length > 0 ? (
        <span
          className="shrink-0 tabular-nums"
          title={rest
            .map(
              (resourceRef) => resourceById.get(resourceRef.resource_id)?.name ?? resourceRef.name,
            )
            .join(', ')}
        >
          +{rest.length}
          <span className="sr-only">{` more ${rest.length === 1 ? 'attachment' : 'attachments'}`}</span>
        </span>
      ) : null}
    </span>
  );
}

function QueuedResourceAttachment({
  onOpen,
  resource,
  resourceRef,
}: {
  onOpen?: (resource: WorkspaceResource) => void;
  resource?: WorkspaceResource;
  resourceRef: ResourceRefPart;
}) {
  const filename = resource?.name ?? resourceRef.name;
  const mediaType = resource?.detected_mime || resource?.claimed_mime || '';
  const availability = resourceAvailability(resource);
  const stages = resourcePipelineStages(resource, availability);
  const openable = Boolean(resource && onOpen);
  const activate = () => {
    if (resource) onOpen?.(resource);
  };

  return (
    <AttachmentHoverCard closeDelay={100} openDelay={220}>
      <AttachmentHoverCardTrigger asChild>
        <Attachment
          aria-label={openable ? `Open ${filename}` : filename}
          className={cn(
            'h-6 max-w-36 min-w-0 gap-1 rounded-[5px] border-0 px-1 text-[12px] font-normal text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring dark:hover:bg-hover',
            !openable && 'cursor-default',
          )}
          data={{ filename, id: resourceRef.resource_id, mediaType, type: 'file', url: '' }}
          onClick={activate}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            activate();
          }}
          role={openable ? 'button' : undefined}
          tabIndex={openable ? 0 : undefined}
        >
          <AttachmentPreview className="size-3.5 bg-transparent [&_svg]:size-3" />
          <AttachmentInfo className="min-w-0 truncate" />
          <ResourcePipelineSummaryIcon stages={stages} />
        </Attachment>
      </AttachmentHoverCardTrigger>
      <AttachmentHoverCardContent className="max-w-72 border bg-popover p-3 shadow-md">
        <p className="truncate text-sm font-medium">{filename}</p>
        {mediaType ? <p className="mt-0.5 text-xs text-muted-foreground">{mediaType}</p> : null}
        <div className="mt-2">
          <ResourcePipelineStatusLines stages={stages} />
        </div>
        <p className="mt-2 max-w-64 text-xs text-muted-foreground">{availability.detail}</p>
      </AttachmentHoverCardContent>
    </AttachmentHoverCard>
  );
}
