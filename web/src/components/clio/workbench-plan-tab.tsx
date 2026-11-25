import { CopyIcon, FileTextIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { planOriginLabel, planStatusLabel } from '@/lib/plan-status';
import { useLiveStore } from '@/store/live-store';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { MenuRow } from './primitives/menu-row';
import { StateView } from './primitives/state-view';
import { PlanContent } from './session-plan-section';
import { useSessionWork } from './use-session-work';
import type { WorkbenchTab } from './workbench-shared';
import { t } from '@lingui/core/macro';

/**
 * The conversation's working plan as a workbench tab, read only: the conversation ›
 * Working plan, its status, where it came from, then its steps. The file stays one
 * More menu away (copy its path, open the file itself to cite it).
 */
export function WorkbenchPlanTab({
  tab,
  onOpenFile,
}: {
  tab: Extract<WorkbenchTab, { kind: 'plan' }>;
  onOpenFile: (path: string) => void;
}) {
  const conversation = useLiveStore((state) => state.entities.sessions[tab.sessionId]?.title);
  const work = useSessionWork(tab.sessionId);
  const plan = work.data?.plan;
  const crumbs = conversation ? [{ label: conversation }, { label: tab.label }] : [{ label: tab.label }];
  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-slot="plan-tab">
      <FrameBar
        actions={plan?.path ? <PlanTabMenu onOpenFile={onOpenFile} path={plan.path} /> : undefined}
        label={t`Working plan actions`}
        what={plan ? <span>{planStatusLabel(plan.status)}</span> : undefined}
        where={<FrameCrumbs parts={crumbs} />}
      />
      {plan ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [overflow-wrap:anywhere]">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <p className="text-xs text-muted-foreground" data-slot="session-plan-origin">
              {planOriginLabel(plan.status)}
            </p>
            <PlanContent text={plan.text} />
          </div>
        </div>
      ) : (
        <StateView
          className="min-h-0 flex-1"
          kind={work.isPending ? 'loading' : work.error ? 'error' : 'empty'}
          size="viewer"
          title={
            work.isPending
              ? t`Loading the plan`
              : work.error
                ? t`The plan could not be loaded.`
                : t`This conversation has no working plan yet.`
          }
        />
      )}
    </div>
  );
}

function PlanTabMenu({ path, onOpenFile }: { path: string; onOpenFile: (path: string) => void }) {
  const copy = () =>
    void navigator.clipboard
      .writeText(path)
      .then(() => toast.success(t`Copied the path.`))
      .catch(() => toast.error(t`Could not copy the path.`));
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t`More actions for the working plan`}
          size="icon-sm"
          title={t`More actions`}
          type="button"
          variant="ghost"
        >
          <MoreIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-80 min-w-56">
        <DropdownMenuItem data-plan-open-file onSelect={() => onOpenFile(path)}>
          <MenuRow
            description={t`Read or cite the Markdown the agent keeps.`}
            icon={<FileTextIcon />}
            label={t`Open the plan file`}
          />
        </DropdownMenuItem>
        <DropdownMenuItem data-plan-copy-path onSelect={copy}>
          <MenuRow description={path} icon={<CopyIcon />} label={t`Copy path`} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
