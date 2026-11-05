import { useContext, useState } from 'react';
import { ShieldAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRepository } from '@/hooks/use-repository';
import { PresentationNavigation } from './presentation-navigation';
import type { SandboxBoundary } from './sandbox-boundary';

const folderName = (path: string) => path.split(/[\\/]/u).filter(Boolean).at(-1) || path;

/** A call row's short mark that the sandbox blocked it; the explanation on hover. */
export function SandboxBoundaryBadge({ boundary }: { boundary: SandboxBoundary }) {
  const folders = boundary.request_roots.map(folderName).join(', ');
  const words =
    boundary.kind === 'elevation_required'
      ? 'Needs administrator rights'
      : folders
        ? `Sandbox: ${folders}`
        : 'Sandbox';
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
            data-slot="sandbox-boundary-badge"
            tabIndex={0}
          >
            <ShieldAlertIcon aria-hidden="true" className="size-3.5 text-warning" />
            {words}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm text-sm">
          <span className="[overflow-wrap:anywhere]">{boundary.message}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Words for what the sandbox did, always shown with the icon (never the icon alone). */
function headline(boundary: SandboxBoundary): string {
  if (boundary.kind === 'elevation_required') return 'Needs administrator rights';
  const folders = boundary.request_roots.map(folderName).join(', ');
  if (boundary.confidence !== 'confirmed') return 'May have been blocked by the sandbox';
  return folders ? `Blocked by the sandbox: ${folders}` : 'Blocked by the sandbox';
}

/**
 * A failed call that hit CLIO's sandbox: what was blocked, the exact explanation on hover,
 * and, for a confirmed blocked write, a way for the person to allow that folder for the
 * workspace (the same grant as Settings › Permissions; the agent retries itself).
 */
export function SandboxBoundaryNotice({ boundary }: { boundary: SandboxBoundary }) {
  const navigation = useContext(PresentationNavigation);
  const repository = useRepository();
  const [state, setState] = useState<Record<string, 'pending' | 'granted' | string>>({});
  const workspaceId = navigation?.workspaceId;
  const grantable =
    boundary.kind === 'write_denied' && boundary.confidence === 'confirmed' && Boolean(workspaceId);
  const grant = async (root: string) => {
    setState((previous) => ({ ...previous, [root]: 'pending' }));
    try {
      await repository.grantWorkspaceFolder(workspaceId!, root);
      setState((previous) => ({ ...previous, [root]: 'granted' }));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setState((previous) => ({ ...previous, [root]: message }));
    }
  };
  return (
    <div
      className="ml-7 flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground"
      data-slot="sandbox-boundary"
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex min-w-0 items-center gap-1.5" tabIndex={0}>
              <ShieldAlertIcon aria-hidden="true" className="size-4 shrink-0 text-warning" />
              <span className="[overflow-wrap:anywhere]">{headline(boundary)}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm text-sm">
            <span className="[overflow-wrap:anywhere]">{boundary.message}</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {grantable
        ? boundary.request_roots.map((root) =>
            state[root] === 'granted' ? (
              <span key={root} role="status">
                {`Allowed ${folderName(root)} for this workspace`}
              </span>
            ) : (
              <span key={root} className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  title={root}
                  disabled={state[root] === 'pending'}
                  onClick={() => void grant(root)}
                >
                  {`Allow ${folderName(root)}`}
                </Button>
                {state[root] && state[root] !== 'pending' ? (
                  <span role="alert" className="text-destructive">
                    {state[root]}
                  </span>
                ) : null}
              </span>
            ),
          )
        : null}
    </div>
  );
}
