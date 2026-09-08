import { useContext } from 'react';
import type { ToolPresentationBlock } from '@clio/core/v3';
import { PresentationNavigation } from './presentation-navigation';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Resolve declared result links through the conversation's existing workbench. */
export function PresentationLink({
  block,
  compact = false,
}: {
  block: ToolPresentationBlock;
  compact?: boolean;
}) {
  const navigation = useContext(PresentationNavigation);
  const uri = block.uri ?? '';
  const label = block.label || block.text || uri;
  const filename = compact && block.target === 'file';
  const text = filename ? (
    <span className="flex min-w-0">
      <span className="truncate">{label.slice(0, -12)}</span>
      <span className="shrink-0">{label.slice(-12)}</span>
    </span>
  ) : (
    <span className={compact ? 'truncate' : undefined}>{label}</span>
  );
  const className = cn('text-sm', compact ? 'min-w-0 max-w-[42ch] truncate' : 'break-words');
  const withTooltip = (element: React.ReactElement) =>
    compact ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{element}</TooltipTrigger>
          <TooltipContent className="max-w-sm break-words">{uri || label}</TooltipContent>
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
  let open: (() => void) | undefined;
  if (block.target === 'artifact' && artifact && navigation?.onOpenArtifact)
    open = () => navigation.onOpenArtifact?.(artifact);
  else if (block.target === 'resource' && resource && navigation?.onOpenResource)
    open = () => navigation.onOpenResource?.(resource);
  else if (block.target === 'session' && child && navigation?.onOpenSubagent)
    open = () => navigation.onOpenSubagent?.(child, 'conversation');
  else if (
    (block.target === 'file' || block.target === 'resource' || block.target === 'artifact') &&
    /^(?:[a-z]:[\\/]|\/)/iu.test(uri) &&
    navigation?.onOpenFile
  )
    open = () => navigation.onOpenFile?.(uri);
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
        aria-label={label}
        title={uri}
      >
        {text}
      </Button>,
    );
  if (/^https?:\/\//iu.test(uri))
    return withTooltip(
      <a
        className={cn(className, 'underline')}
        href={uri}
        target="_blank"
        rel="noopener noreferrer"
      >
        {text}
      </a>,
    );
  if (block.target === 'session' && uri)
    return withTooltip(
      <a className={cn(className, 'underline')} href={`./${encodeURIComponent(uri)}`}>
        {text}
      </a>,
    );
  return withTooltip(
    <span className={className} tabIndex={compact ? 0 : undefined}>
      {text}
      {!compact && uri && label !== uri ? ` · ${uri}` : ''}
    </span>,
  );
}
