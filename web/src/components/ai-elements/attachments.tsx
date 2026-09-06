'use client';

import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import type { FileUIPart, SourceDocumentUIPart } from 'ai';
import {
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  Music2Icon,
  PaperclipIcon,
  VideoIcon,
  XIcon,
} from 'lucide-react';
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export type AttachmentData =
  | (FileUIPart & { id: string })
  | (SourceDocumentUIPart & { id: string });

export type AttachmentMediaCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'source'
  | 'unknown';

export type AttachmentVariant = 'composer' | 'grid' | 'inline' | 'list';

const mediaCategoryIcons: Record<AttachmentMediaCategory, typeof ImageIcon> = {
  audio: Music2Icon,
  document: FileTextIcon,
  image: ImageIcon,
  source: GlobeIcon,
  unknown: PaperclipIcon,
  video: VideoIcon,
};

// ============================================================================
// Utility Functions
// ============================================================================

export const getMediaCategory = (data: AttachmentData): AttachmentMediaCategory => {
  if (data.type === 'source-document') {
    return 'source';
  }

  const mediaType = data.mediaType ?? '';

  if (mediaType.startsWith('image/')) {
    return 'image';
  }
  if (mediaType.startsWith('video/')) {
    return 'video';
  }
  if (mediaType.startsWith('audio/')) {
    return 'audio';
  }
  if (mediaType.startsWith('application/') || mediaType.startsWith('text/')) {
    return 'document';
  }

  return 'unknown';
};

export const getAttachmentLabel = (data: AttachmentData): string => {
  if (data.type === 'source-document') {
    return data.title || data.filename || 'Source';
  }

  const category = getMediaCategory(data);
  return data.filename || (category === 'image' ? 'Image' : 'Attachment');
};

const renderAttachmentImage = (
  url: string,
  filename: string | undefined,
  variant: AttachmentVariant,
) =>
  variant === 'grid' || variant === 'composer' ? (
    <img
      alt={filename || 'Image'}
      className="size-full object-cover"
      height={variant === 'composer' ? 144 : 96}
      src={url}
      width={variant === 'composer' ? 144 : 96}
    />
  ) : (
    <img
      alt={filename || 'Image'}
      className="size-full rounded object-cover"
      height={20}
      src={url}
      width={20}
    />
  );

// ============================================================================
// Contexts
// ============================================================================

interface AttachmentsContextValue {
  variant: AttachmentVariant;
}

const AttachmentsContext = createContext<AttachmentsContextValue | null>(null);

interface AttachmentContextValue {
  data: AttachmentData;
  mediaCategory: AttachmentMediaCategory;
  onRemove?: () => void;
  variant: AttachmentVariant;
}

const AttachmentContext = createContext<AttachmentContextValue | null>(null);

// ============================================================================
// Hooks
// ============================================================================

export const useAttachmentsContext = () =>
  useContext(AttachmentsContext) ?? { variant: 'grid' as const };

export const useAttachmentContext = () => {
  const ctx = useContext(AttachmentContext);
  if (!ctx) {
    throw new Error('Attachment components must be used within <Attachment>');
  }
  return ctx;
};

// ============================================================================
// Attachments - Container
// ============================================================================

export type AttachmentsProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AttachmentVariant;
};

export const Attachments = ({
  variant = 'grid',
  className,
  children,
  ...props
}: AttachmentsProps) => {
  const contextValue = useMemo(() => ({ variant }), [variant]);

  return (
    <AttachmentsContext.Provider value={contextValue}>
      <div
        className={cn(
          'flex items-start',
          variant === 'list' ? 'flex-col gap-2' : 'flex-wrap gap-2',
          variant === 'grid' && 'ml-auto w-fit',
          variant === 'composer' && 'w-max min-w-full flex-nowrap',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </AttachmentsContext.Provider>
  );
};

// ============================================================================
// Attachment - Item
// ============================================================================

export type AttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: AttachmentData;
  onRemove?: () => void;
};

export const Attachment = ({ data, onRemove, className, children, ...props }: AttachmentProps) => {
  const { variant } = useAttachmentsContext();
  const mediaCategory = getMediaCategory(data);
  const visualComposerAttachment =
    variant === 'composer' && (mediaCategory === 'image' || mediaCategory === 'video');

  const contextValue = useMemo<AttachmentContextValue>(
    () => ({ data, mediaCategory, onRemove, variant }),
    [data, mediaCategory, onRemove, variant],
  );

  return (
    <AttachmentContext.Provider value={contextValue}>
      <div
        className={cn(
          'group relative',
          variant === 'grid' && 'size-24 overflow-hidden rounded-lg',
          visualComposerAttachment && 'size-36 shrink-0 overflow-hidden rounded-lg border bg-muted',
          variant === 'composer' &&
            !visualComposerAttachment &&
            'flex size-36 shrink-0 flex-col overflow-hidden rounded-lg border bg-background',
          variant === 'inline' && [
            'flex h-8 cursor-pointer select-none items-center gap-1.5',
            'rounded-md border border-border px-1.5',
            'font-medium text-sm transition-all',
            'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
          ],
          variant === 'list' && [
            'flex w-full items-center gap-3 rounded-lg border p-3',
            'hover:bg-accent/50',
          ],
          className,
        )}
        data-attachment-category={mediaCategory}
        data-attachment-variant={variant}
        data-slot="attachment"
        {...props}
      >
        {children}
      </div>
    </AttachmentContext.Provider>
  );
};

// ============================================================================
// AttachmentPreview - Media preview
// ============================================================================

export type AttachmentPreviewProps = HTMLAttributes<HTMLDivElement> & {
  fallbackIcon?: ReactNode;
};

export const AttachmentPreview = ({
  fallbackIcon,
  className,
  ...props
}: AttachmentPreviewProps) => {
  const { data, mediaCategory, variant } = useAttachmentContext();

  const iconSize =
    variant === 'inline'
      ? 'size-3'
      : variant === 'composer' && mediaCategory !== 'image' && mediaCategory !== 'video'
        ? 'size-7'
        : 'size-4';

  const renderIcon = (Icon: typeof ImageIcon) => (
    <Icon className={cn(iconSize, 'text-muted-foreground')} />
  );

  const renderContent = () => {
    if (mediaCategory === 'image' && data.type === 'file' && data.url) {
      return renderAttachmentImage(data.url, data.filename, variant);
    }

    if (mediaCategory === 'video' && data.type === 'file' && data.url) {
      return <video className="size-full object-cover" muted src={data.url} />;
    }

    const Icon = mediaCategoryIcons[mediaCategory];
    return fallbackIcon ?? renderIcon(Icon);
  };

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden',
        variant === 'grid' && 'size-full bg-muted',
        variant === 'composer' &&
          (mediaCategory === 'image' || mediaCategory === 'video') &&
          'size-full bg-muted',
        variant === 'composer' &&
          mediaCategory !== 'image' &&
          mediaCategory !== 'video' &&
          'min-h-0 w-full flex-1 bg-muted/60',
        variant === 'inline' && 'size-5 rounded bg-background',
        variant === 'list' && 'size-12 rounded bg-muted',
        className,
      )}
      {...props}
    >
      {renderContent()}
    </div>
  );
};

// ============================================================================
// AttachmentInfo - Name and type display
// ============================================================================

export type AttachmentInfoProps = HTMLAttributes<HTMLDivElement> & {
  showMediaType?: boolean;
};

export const AttachmentInfo = ({
  showMediaType = false,
  className,
  ...props
}: AttachmentInfoProps) => {
  const { data, mediaCategory, variant } = useAttachmentContext();
  const label = getAttachmentLabel(data);

  if (
    variant === 'grid' ||
    (variant === 'composer' && (mediaCategory === 'image' || mediaCategory === 'video'))
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        'min-w-0 flex-1',
        variant === 'composer' &&
          'w-full flex-none border-t bg-background px-2 py-1.5 pr-8 leading-tight',
        className,
      )}
      {...props}
    >
      <span className="block truncate">{label}</span>
      {showMediaType && data.mediaType && (
        <span className="block truncate text-muted-foreground text-xs">{data.mediaType}</span>
      )}
    </div>
  );
};

// ============================================================================
// AttachmentRemove - Remove button
// ============================================================================

export type AttachmentRemoveProps = ComponentProps<typeof Button> & {
  label?: string;
};

export const AttachmentRemove = ({
  label = 'Remove',
  className,
  children,
  ...props
}: AttachmentRemoveProps) => {
  const { onRemove, variant } = useAttachmentContext();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove?.();
    },
    [onRemove],
  );

  if (!onRemove) {
    return null;
  }

  return (
    <Button
      aria-label={label}
      className={cn(
        variant === 'grid' && [
          'absolute top-2 right-2 size-6 rounded-full p-0',
          'bg-background/80 backdrop-blur-sm',
          'opacity-0 transition-opacity group-hover:opacity-100',
          'hover:bg-background',
          '[&>svg]:size-3',
        ],
        variant === 'composer' && [
          'absolute top-2 right-2 size-6 rounded-full p-0',
          'bg-background/85 opacity-0 shadow-sm backdrop-blur-sm transition-opacity',
          'group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-background',
          '[&>svg]:size-3',
        ],
        variant === 'inline' && [
          'size-5 rounded p-0',
          // Focus reveals it too, or the control is unreachable by keyboard.
          'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
          '[&>svg]:size-2.5',
        ],
        variant === 'list' && ['size-8 shrink-0 rounded p-0', '[&>svg]:size-4'],
        className,
      )}
      onClick={handleClick}
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <XIcon />}
      <span className="sr-only">{label}</span>
    </Button>
  );
};

// ============================================================================
// AttachmentHoverCard - Hover preview
// ============================================================================

export type AttachmentHoverCardProps = ComponentProps<typeof HoverCard>;

export const AttachmentHoverCard = ({
  openDelay = 0,
  closeDelay = 0,
  defaultOpen = false,
  onOpenChange,
  open,
  ...props
}: AttachmentHoverCardProps) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const resolvedOpen = open ?? internalOpen;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  useEffect(() => {
    if (!resolvedOpen) return;
    const closeForScroll = () => setOpen(false);
    window.addEventListener('scroll', closeForScroll, true);
    return () => window.removeEventListener('scroll', closeForScroll, true);
  }, [resolvedOpen, setOpen]);

  return (
    <HoverCard
      closeDelay={closeDelay}
      onOpenChange={setOpen}
      open={resolvedOpen}
      openDelay={openDelay}
      {...props}
    />
  );
};

export type AttachmentHoverCardTriggerProps = ComponentProps<typeof HoverCardTrigger>;

export const AttachmentHoverCardTrigger = (props: AttachmentHoverCardTriggerProps) => (
  <HoverCardTrigger {...props} />
);

export type AttachmentHoverCardContentProps = ComponentProps<typeof HoverCardContent>;

export const AttachmentHoverCardContent = ({
  align = 'start',
  className,
  ...props
}: AttachmentHoverCardContentProps) => (
  <HoverCardContent align={align} className={cn('w-auto p-2', className)} {...props} />
);

// ============================================================================
// AttachmentEmpty - Empty state
// ============================================================================

export type AttachmentEmptyProps = HTMLAttributes<HTMLDivElement>;

export const AttachmentEmpty = ({ className, children, ...props }: AttachmentEmptyProps) => (
  <div
    className={cn('flex items-center justify-center p-4 text-muted-foreground text-sm', className)}
    {...props}
  >
    {children ?? 'No attachments'}
  </div>
);
