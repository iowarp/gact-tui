import { useContext, useState } from 'react';
import { FolderCheckIcon, ShieldAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tag } from './primitives/tag';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRepository } from '@/hooks/use-repository';
import { PresentationNavigation } from './presentation-navigation';
import { DialogFrame } from './primitives/dialog-frame';
import { KeyValueGrid } from './primitives/key-value-grid';
import { setFolderGrant, useFolderGrants } from './sandbox-boundary-grants';
import { useWorkspaceFolders } from './workspace-folders';
import type { SandboxBoundary } from './sandbox-boundary';
import { ph, t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

const folderName = (path: string) => path.split(/[\\/]/u).filter(Boolean).at(-1) || path;

/** A call row's Blocked tag, in the row's fixed badge column; the explanation on hover. */
export function SandboxBoundaryBadge({ boundary }: { boundary: SandboxBoundary }) {
  const folders = boundary.request_roots.map(folderName).join(', ');
  const words = boundary.kind === 'elevation_required' ? t`Admin` : t`Blocked`;
  const name =
    boundary.kind === 'elevation_required'
      ? t`Needs administrator rights`
      : folders
        ? t`Sandbox: ${folders}`
        : t`Sandbox`;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="grid shrink-0 rounded-[4px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-slot="sandbox-boundary-badge"
            aria-label={name}
            tabIndex={0}
          >
            <Tag tone="caution" title="">
              {words}
            </Tag>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm text-sm">
          <span className="[overflow-wrap:anywhere]">{`${name}. ${boundary.message}`}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
/** Words for what the sandbox did, always shown with the icon (never the icon alone). */
function headline(boundary: SandboxBoundary): string {
  if (boundary.kind === 'elevation_required') return t`Needs administrator rights`;
  const folders = boundary.request_roots.map(folderName).join(', ');
  if (boundary.confidence !== 'confirmed') return t`May have been blocked by the sandbox`;
  return folders ? t`Blocked by the sandbox: ${folders}` : t`Blocked by the sandbox`;
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
  const acted = useFolderGrants(workspaceId, boundary.request_roots);
  const folders = useWorkspaceFolders(workspaceId);
  // Allowed on this page, or already among the workspace's folders (after a reload too).
  const state = Object.fromEntries(
    boundary.request_roots.map((root) => [root, folders.isAllowed(root) ? 'granted' : acted[root]]),
  ) as Record<string, string | undefined>;
  const [asking, setAsking] = useState<string>();
  const grantable =
    boundary.kind === 'write_denied' && boundary.confidence === 'confirmed' && Boolean(workspaceId);
  const grant = async (root: string) => {
    setFolderGrant(workspaceId!, root, 'pending');
    try {
      await repository.grantWorkspaceFolder(workspaceId!, root);
      setFolderGrant(workspaceId!, root, 'granted');
      void folders.refresh();
    } catch (reason) {
      setFolderGrant(workspaceId!, root, reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <div
      className={
        placement === 'message'
          ? 'flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm'
          : 'ml-[22px] flex min-h-7 min-w-0 flex-wrap items-center gap-2 text-menu text-muted-foreground'
      }
      data-placement={placement}
      data-slot="sandbox-boundary"
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex min-w-0 items-center gap-1.5" tabIndex={0}>
              <ShieldAlertIcon
                aria-hidden="true"
                className={
                  placement === 'call'
                    ? 'size-3.5 shrink-0 text-warning'
                    : 'size-4 shrink-0 text-warning'
                }
              />
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
                {t`Allowed ${ph({ folder: folderName(root) })} for this workspace`}
              </span>
            ) : (
              <span key={root} className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className={placement === 'call' ? 'h-6 gap-1.5 px-2 text-meta' : 'h-7'}
                  title={root}
                  disabled={state[root] === 'pending'}
                  onClick={() => setAsking(root)}
                >
                  {t`Allow ${folderName(root)}`}
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
      <DialogFrame
        confirm={{
          label: t`Allow folder`,
          onConfirm: () => {
            if (asking) void grant(asking);
            setAsking(undefined);
          },
        }}
        description={
          boundary.program
            ? t`The sandbox blocked ${ph({ program: boundary.program })} from writing there.`
            : t`The sandbox blocked a command from writing there.`
        }
        icon={<FolderCheckIcon />}
        onOpenChange={(open) => !open && setAsking(undefined)}
        open={Boolean(asking)}
        className="w-[490px]"
        title={t`Allow writing to ${ph({ folder: asking ?? '' })}?`}
      >
        <div data-dialog="allow-folder">
          <KeyValueGrid
            items={[
              {
                label: t`What you allow`,
                title: t`Read and write in ${ph({ folder: asking ?? '' })}`,
                value: (
                  <span className="min-w-0">
                    <Trans>
                      Read and write in <span className="font-mono text-meta">{asking}</span>
                    </Trans>
                  </span>
                ),
                wrap: true,
              },
              {
                label: t`For`,
                value: folders.workspace?.name
                  ? `This workspace, ${folders.workspace.name}`
                  : 'This workspace',
                wrap: true,
              },
              { label: t`Until`, value: t`You remove it in Settings, Permissions`, wrap: true },
            ]}
            variant="facts"
          />
          <p className="mt-2 text-meta text-muted-foreground">
            {t`The blocked command is not run again. Ask the agent to try again.`}
          </p>
        </div>
      </DialogFrame>
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
