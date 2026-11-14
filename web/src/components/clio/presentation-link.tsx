import { subagentOpenTarget } from './subagent-navigation';
import { useContext } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import type { ToolPresentationBlock } from '@clio/core/v3';
import { PresentationNavigation } from './presentation-navigation';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { a2uiSurfaceDomId } from './a2ui-presentation';
import { ConnectedDataSetupLink } from './connected-data-setup-link';
import { ArtifactImagePreview } from './artifact-image-preview';
import { showTaskInWork } from './work-task-focus';
import { ExternalLinkIcon, PanelRightIcon } from 'lucide-react';
import { t } from '@lingui/core/macro';

/** Resolve declared result links through the conversation's existing workbench. */
export function PresentationLink({
  block,
  compact = false,
  iconOnly = false,
  className: extraClassName,
}: {
  block: ToolPresentationBlock;
  compact?: boolean;
  iconOnly?: boolean;
  /** Restyles the label, e.g. as an activity row's mono argument. */
  className?: string;
}) {
  const navigation = useContext(PresentationNavigation);
  const hasRouter = useInRouterContext();
  const uri = block.uri ?? '';
  if (block.target === 'connected_data')
    return iconOnly ? null : <ConnectedDataSetupLink block={block} />;
  const label = block.label || block.text || uri;
  // A row names an absolute path by its folder and file; the tooltip keeps the whole path.
  // Storage holders (fld_…, res_…, workspace hashes) are ids, not names, so they are skipped.
  const shown =
    compact && /^(?:[a-z]:[\\/]|\/)/iu.test(label)
      ? label
          .split(/[\\/]/u)
          .filter((part) => part && !/^(?:(?:fld|res)_)?[0-9a-f]{16,}$/iu.test(part))
          .slice(-2)
          .join('/') || label
      : label;
  const filename = compact && block.target === 'file';
  const text = iconOnly ? (
    block.target === 'url' ? (
      <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
    ) : (
      <PanelRightIcon aria-hidden="true" className="size-3.5" />
    )
  ) : compact && (filename || /[\\/]/u.test(shown)) ? (
    <CompactPathLabel text={shown} />
  ) : (
    <span className={compact ? 'truncate' : undefined}>{shown}</span>
  );
  const className = iconOnly
    ? 'size-5 shrink-0 justify-center text-muted-foreground hover:text-foreground'
    : cn(
        'text-sm',
        // Capped by the row's argument slot too, so the label ends in … instead of being cut.
        compact ? 'min-w-0 max-w-[min(42ch,100%)] shrink truncate' : 'break-words',
        extraClassName,
      );
  const withTooltip = (element: React.ReactElement) =>
    compact ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{element}</TooltipTrigger>
          <TooltipContent className="max-w-sm text-sm">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {iconOnly ? t`Open ${label}` : block.target === 'surface' ? label : uri || label}
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : (
      element
    );
  const artifact = navigation?.artifacts[uri];
  const resource = navigation?.resources?.[uri];
  const child = Object.values(navigation?.subagents ?? {}).find(
    (run) => run.child_session_id === uri,
  );
  let open: ((event: { shiftKey: boolean }) => void) | undefined;
  if (block.target === 'artifact' && artifact && navigation?.onOpenArtifact)
    open = () => navigation.onOpenArtifact?.(artifact);
  else if (block.target === 'resource' && resource && navigation?.onOpenResource)
    open = () => navigation.onOpenResource?.(resource);
  else if (block.target === 'session' && child && navigation?.onOpenSubagent)
    open = (event) => navigation.onOpenSubagent?.(child, subagentOpenTarget(event));
  else if (
    block.target === 'session' &&
    uri &&
    navigation?.onOpenSession &&
    navigation.sessionAvailable?.(uri)
  )
    open = () => navigation.onOpenSession?.(uri);
  else if (block.target === 'work' && navigation?.onOpenWork) open = navigation.onOpenWork;
  else if (block.target === 'task' && uri && navigation?.onOpenTasks) {
    // The background tasks open at the row of the task the link names.
    const openTasks = navigation.onOpenTasks;
    open = () => showTaskInWork(uri, openTasks);
  } else if (block.target === 'surface' && navigation?.surfaces?.[uri])
    open = () => {
      const surface = document.getElementById(a2uiSurfaceDomId(uri));
      surface?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      surface?.focus({ preventScroll: true });
    };
  else if (
    (block.target === 'file' || block.target === 'resource' || block.target === 'artifact') &&
    /^(?:[a-z]:[\\/]|\/)/iu.test(uri) &&
    block.line !== undefined &&
    navigation?.onOpenFileReference
  )
    // A link that names a line (a read range, a search hit) opens the file there.
    open = () => navigation.onOpenFileReference?.(uri, { line: block.line });
  else if (
    (block.target === 'file' || block.target === 'resource' || block.target === 'artifact') &&
    /^(?:[a-z]:[\\/]|\/)/iu.test(uri) &&
    navigation?.onOpenFile
  )
    open = () => navigation.onOpenFile?.(uri);
  if (
    block.target === 'artifact' &&
    artifact &&
    /^image\//u.test(block.media_type ?? '') &&
    !iconOnly
  )
    return (
      <span className="flex flex-col items-start gap-1">
        <ArtifactImagePreview
          artifact={artifact}
          mediaType={block.media_type ?? 'image/png'}
          label={label}
          onOpen={open ? () => open?.({ shiftKey: false }) : undefined}
        />
        <span className={className}>{label}</span>
      </span>
    );
  if (open)
    return withTooltip(
      <Button
        variant="link"
        className={cn(
          'h-auto justify-start p-0 text-left',
          className,
          !compact && 'whitespace-normal',
        )}
        onClick={open}
        aria-label={iconOnly ? t`Open ${label}` : label}
        title={iconOnly ? t`Open ${label}` : block.target === 'surface' ? label : uri}
      >
        {text}
      </Button>,
    );
  if (block.target === 'url' && /^https?:\/\//iu.test(uri))
    return withTooltip(
      <ExternalLink
        className={cn('underline', className)}
        href={uri}
        aria-label={iconOnly ? t`Open ${label}` : undefined}
      >
        {text}
      </ExternalLink>,
    );
  // Offline reviews have no live session router. Retain the recorded label
  // without constructing a live navigation control or crashing the transcript.
  if (block.target === 'session' && uri && hasRouter)
    return withTooltip(
      <Link
        className={cn('underline', className)}
        relative="path"
        aria-label={iconOnly ? t`Open ${label}` : undefined}
        to={`../${encodeURIComponent(uri)}`}
      >
        {text}
      </Link>,
    );
  if (block.target === 'memory' && uri && hasRouter)
    return withTooltip(
      <Link
        className={cn('underline', className)}
        aria-label={iconOnly ? t`Open ${label} in memory` : undefined}
        to={`/settings/memory?${memoryLinkParams(uri)}`}
      >
        {text}
      </Link>,
    );
  if (iconOnly) return null;
  return withTooltip(
    <span className={className} tabIndex={compact ? 0 : undefined}>
      {text}
    </span>,
  );
}

/**
 * A path in a narrow row: its folder gives way first, then the name's end, and the
 * extension stays, so the name is never cut to a one-letter stub.
 */
function CompactPathLabel({ text }: { text: string }) {
  const slash = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  const folder = slash > 0 ? text.slice(0, slash + 1) : '';
  const leaf = text.slice(slash + 1);
  const dot = leaf.lastIndexOf('.');
  const extension = dot > 0 && leaf.length - dot <= 8 ? leaf.slice(dot) : '';
  const stem = extension ? leaf.slice(0, dot) : leaf;
  return (
    <span className="flex min-w-0" data-long-label={leaf.length > 11 ? '' : undefined}>
      {folder ? <span className="min-w-0 shrink-[1000] truncate">{folder}</span> : null}
      <span className="min-w-0 truncate">{stem}</span>
      {extension ? <span className="shrink-0">{extension}</span> : null}
    </span>
  );
}

/** ``<document>#<fact id>`` opens the memory page on that fact; a bare name on the document. */
function memoryLinkParams(uri: string): URLSearchParams {
  if (uri.startsWith('scope:')) return new URLSearchParams({ scope: uri.slice(6) });
  const [doc = uri, fact] = uri.split('#', 2);
  return new URLSearchParams(fact ? { doc, fact } : { doc });
}
