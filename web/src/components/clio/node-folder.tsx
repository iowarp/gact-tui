import { FolderIcon } from 'lucide-react';
import { useContext } from 'react';
import { useTaskChildSession } from '@/hooks/use-flow-run';
import { cn } from '@/lib/utils';
import { PresentationNavigation } from './presentation-navigation';

/**
 * The folder a node of an isolated run worked in, written as its path. The
 * path opens the folder when the surface can show it (the Files view live, the
 * export's included files offline); otherwise it is text.
 */
export function NodeFolder({
  path,
  name,
  onOpen,
  className,
}: {
  path: string;
  /** The node's name, for the open button's label. */
  name: string;
  onOpen?: (path: string) => void;
  className?: string;
}) {
  return (
    <p
      className={cn('flex min-w-0 items-baseline gap-1.5 text-[11px] leading-4', className)}
      data-slot="node-folder"
    >
      <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
        <FolderIcon aria-hidden="true" className="size-3 self-center" /> Folder
      </span>
      {onOpen ? (
        <button
          aria-label={`Open the folder of ${name}`}
          className="min-w-0 text-left font-mono underline decoration-border underline-offset-2 [overflow-wrap:anywhere] hover:text-primary"
          onClick={() => onOpen(path)}
          title={path}
          type="button"
        >
          {path}
        </button>
      ) : (
        <span className="min-w-0 font-mono [overflow-wrap:anywhere]" title={path}>
          {path}
        </span>
      )}
    </p>
  );
}

/**
 * A workflow step's folder in an isolated run: its conversation's recorded
 * `node_folder`, where the surface knows it (an export carries each exported
 * session's). Nothing when the run does not isolate its steps.
 */
export function StepFolder({ handle, name }: { handle?: string; name: string }) {
  const navigation = useContext(PresentationNavigation);
  const lookup = navigation?.nodeFolder;
  const child = useTaskChildSession(handle, Boolean(lookup));
  const path = child ? (lookup?.(child) ?? '') : '';
  if (!path) return null;
  const open = navigation?.onOpenFolder;
  const available = navigation?.folderAvailable?.(path) ?? Boolean(open);
  return <NodeFolder name={name} onOpen={open && available ? open : undefined} path={path} />;
}
