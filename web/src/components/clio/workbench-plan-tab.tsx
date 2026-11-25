import type { SessionWork } from '@clio/core/v3';
import { CopyIcon, FileTextIcon } from 'lucide-react';
import type { ReactNode } from 'react';
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
import { TodoList, TodoStatusIcon } from './todo-list';
import { useSessionWork } from './use-session-work';
import type { WorkbenchTab } from './workbench-shared';
import { t } from '@lingui/core/macro';

type Todo = SessionWork['todos'][number];

/**
 * The conversation's plan and its todos, read only, as two separate things in one tab:
 * the plan document as written (the result of a planning phase), then the agent's todo
 * list. Without a plan document the tab says so and shows only the todos. The plan file
 * stays one More menu away (copy its path, open the file itself to cite it).
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
  const todos = work.data?.todos ?? [];
  const crumbs = conversation
    ? [{ label: conversation }, { label: tab.label }]
    : [{ label: tab.label }];
  const origin = plan ? planOriginLabel(plan) : null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-slot="plan-tab">
      <FrameBar
        actions={plan?.path ? <PlanTabMenu onOpenFile={onOpenFile} path={plan.path} /> : undefined}
        label={t`Plan actions`}
        what={plan ? <span>{planStatusLabel(plan.status)}</span> : undefined}
        where={<FrameCrumbs parts={crumbs} />}
      />
      {work.data && (plan || todos.length) ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [overflow-wrap:anywhere]">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {plan ? (
              <PlanTabSection slot="plan-tab-plan" title={t`Plan`}>
                {origin ? (
                  <p className="text-xs text-muted-foreground" data-slot="session-plan-origin">
                    {origin}
                  </p>
                ) : null}
                <PlanContent text={plan.text} />
              </PlanTabSection>
            ) : (
              <p className="text-sm text-muted-foreground" data-slot="plan-tab-no-plan">
                {t`No plan was written for this conversation. The agent kept only todos.`}
              </p>
            )}
            {todos.length ? (
              <PlanTabSection slot="plan-tab-todos" title={t`Todos`}>
                <TodoList
                  items={todos}
                  renderItem={(todo, index) => (
                    <PlanTabTodo key={`${index}:${todo.content}`} todo={todo} />
                  )}
                  scope="work"
                  status={(todo) => todo.status}
                  summary
                />
              </PlanTabSection>
            ) : (
              <p className="text-xs text-muted-foreground" data-slot="plan-tab-no-todos">
                {t`The agent has kept no todos in this conversation.`}
              </p>
            )}
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
                : t`No plan or todos in this conversation yet.`
          }
        />
      )}
    </div>
  );
}

function PlanTabSection({
  slot,
  title,
  children,
}: {
  slot: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2" data-slot={slot}>
      <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function PlanTabTodo({ todo }: { todo: Todo }) {
  return (
    <li className="flex min-w-0 items-start gap-2 text-sm" data-todo-state={todo.status}>
      <TodoStatusIcon className="mt-0.5" state={todo.status} />
      <span className="min-w-0 flex-1">{todo.content}</span>
      <span className="shrink-0 pt-px text-xs text-muted-foreground">
        {todo.status === 'in_progress'
          ? t`In progress`
          : todo.status === 'completed'
            ? t`Completed`
            : t`Pending`}
      </span>
    </li>
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
          aria-label={t`More actions for the plan`}
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
