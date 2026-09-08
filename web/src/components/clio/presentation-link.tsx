import { useContext } from 'react';
import type { ToolPresentationBlock } from '@clio/core/v3';
import { PresentationNavigation } from './presentation-navigation';
import { Button } from '@/components/ui/button';

/** Resolve declared result links through the conversation's existing workbench. */
export function PresentationLink({ block }: { block: ToolPresentationBlock }) {
  const navigation = useContext(PresentationNavigation);
  const uri = block.uri ?? '';
  const label = block.label || uri;
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
    return (
      <Button
        variant="link"
        className="h-auto justify-start whitespace-normal p-0 text-left text-sm"
        onClick={open}
        title={uri}
      >
        {label}
      </Button>
    );
  if (/^https?:\/\//iu.test(uri))
    return (
      <a className="text-sm underline" href={uri} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  if (block.target === 'session' && uri)
    return (
      <a className="text-sm underline" href={`./${encodeURIComponent(uri)}`}>
        {label}
      </a>
    );
  return (
    <span className="break-words text-sm">
      {label}
      {label !== uri ? ` · ${uri}` : ''}
    </span>
  );
}
