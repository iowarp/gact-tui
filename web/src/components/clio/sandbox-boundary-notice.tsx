import { useContext } from 'react';
import { ShieldAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRepository } from '@/hooks/use-repository';
import { PresentationNavigation } from './presentation-navigation';
import { setFolderGrant, useFolderGrants } from './sandbox-boundary-grants';
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
export function SandboxBoundaryNotice({
  boundary,
  placement = 'call',
}: {
  boundary: SandboxBoundary;
  /** `call`: inside the call's result; `message`: on the turn, where the person reads. */
  placement?: 'call' | 'message';
}) {
  const navigation = useContext(PresentationNavigation);
  const repository = useRepository();
  const workspaceId = navigation?.workspaceId;
  const state = useFolderGrants(workspaceId, boundary.request_roots);
  const grantable =
    boundary.kind === 'write_denied' && boundary.confidence === 'confirmed' && Boolean(workspaceId);
  const grant = async (root: string) => {
    setFolderGrant(workspaceId!, root, 'pending');
    try {
      await repository.grantWorkspaceFolder(workspaceId!, root);
      setFolderGrant(workspaceId!, root, 'granted');
    } catch (reason) {
      setFolderGrant(workspaceId!, root, reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <div
      className={
        placement === 'message'
          ? 'flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm'
          : 'ml-7 flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground'
      }
      data-placement={placement}
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

/** The sandbox boundaries a turn's calls ran into, one per blocked folder set. */
export function TurnSandboxNotices({ boundaries }: { boundaries: SandboxBoundary[] }) {
  const seen = new Set<string>();
  const unique = boundaries.filter((boundary) => {
    const key = `${boundary.kind}:${boundary.request_roots.join('|') || boundary.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!unique.length) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-slot="turn-sandbox-notices">
      {unique.map((boundary, index) => (
        <SandboxBoundaryNotice key={index} boundary={boundary} placement="message" />
      ))}
    </div>
  );
}
