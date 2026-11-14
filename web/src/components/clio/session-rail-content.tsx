import type { ConnectedSourceState } from '@clio/core/v3';
import { CalendarClockIcon, DatabaseIcon, ExternalLinkIcon, GlobeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { artifactDeliverables } from '@/lib/artifact-presentation';
import { openHumanQuestions } from '@/lib/inline-question';
import type { ClioObservabilityDockProps } from './observability-dock-shell';
import { contextUsedSummary } from './context-composition-model';
import { ContextCompositionBar, ContextUsage } from './context-usage';
import { RailRuns } from './rail-runs';
import { sessionEvidenceItems } from './session-evidence-items';
import {
  normalizedFilePath,
  sessionFiles,
  sessionDiffs,
  sessionPlans,
} from './session-evidence-projection';
import { sessionSources } from './observability-evidence-sources';
import { OpenQuestionList } from './open-question-list';
import { useQuestionAnswer } from './question-answer-context';
import { SessionRail } from './session-rail';
import { SessionUsageReadout } from './session-usage-readout';
import type { SessionRailItem } from './session-rail-layout';
import { SessionSummaryRow } from './session-summary-row';
import { useSessionConnectedSources, useSessionSchedules } from './session-inventory-queries';
import { useSessionWork } from './use-session-work';
import { browserPageLabel, useBrowserPages } from './use-browser-pages';
import { SessionWorkSummary } from './session-work';
import { SessionPlanBody } from './session-plan-section';
import { planStatusLabel } from '@/lib/plan-status';
import { TodoList, TodoStatusIcon } from './todo-list';
import type { ReactNode } from 'react';
import { t } from '@lingui/core/macro';

/** Assemble the rail from the same projections, query keys and navigation as full details. */
export function SessionRailContent({
  evidence,
  onOpenSource,
  header,
}: {
  evidence: ClioObservabilityDockProps;
  onOpenSource: (source: ConnectedSourceState) => void;
  /** The rail's title row; receives the Customize control. */
  header?: (customize: ReactNode) => ReactNode;
}) {
  const connected = useSessionConnectedSources(evidence.workspaceId ?? '');
  const work = useSessionWork(evidence.sessionId ?? '');
  const schedules = useSessionSchedules(evidence.sessionId ?? '');
  const browserPages = useBrowserPages(evidence.sessionId ?? '');
  const answer = useQuestionAnswer();
  const questions = openHumanQuestions(evidence.interactions ?? answer?.interactions ?? []);
  const todos = work.data?.todos ?? [];
  const scheduled = schedules.data?.schedules ?? [];
  const sources = connected.data?.filter((source) => source.connected) ?? [];
  const items = sessionEvidenceItems({
    ...evidence,
    outputs: artifactDeliverables(evidence.artifacts).filter(
      (artifact) => artifact.session_relation !== 'used',
    ),
    files: sessionFiles(evidence.contextFiles, evidence.tools, evidence.executionProvenance),
    diffs: sessionDiffs(evidence.diffs, evidence.tools),
    // The live session plan has its own section; earlier proposals of the same file
    // would repeat it.
    plans: sessionPlans(evidence.messages, evidence.interactions ?? [], evidence.artifacts).filter(
      (plan) =>
        !plan.path ||
        !work.data?.plan ||
        normalizedFilePath(plan.path) !== normalizedFilePath(work.data.plan.path),
    ),
    sources: sessionSources(
      evidence.messages,
      evidence.processes,
      evidence.resources ?? [],
      evidence.executionProvenance,
      evidence.artifacts,
    ),
    backgroundProcesses: evidence.processes,
  }).map((item) =>
    // The rail lists runs in the Runs page row; older ones are under All runs.
    // Only Running opens by default; every other row waits to be asked for.
    item.id === 'running'
      ? {
          ...item,
          content: (
            <RailRuns
              processes={evidence.processes}
              subagents={evidence.subagents}
              onOpenSubagent={evidence.onOpenSubagent}
              onOpenFlow={evidence.onOpenFlow}
              onCancelTask={evidence.onCancelTask}
              onControlTask={evidence.onControlTask}
            />
          ),
        }
      : { ...item, defaultOpen: false },
  );
  const inventory: SessionRailItem[] = [
    {
      id: 'context',
      summary: contextUsedSummary(evidence.context, evidence.messages),
      defaultOpen: false,
      below: <ContextCompositionBar context={evidence.context} messages={evidence.messages} />,
      content: (
        <>
          <ContextUsage compact bare context={evidence.context} messages={evidence.messages} />
          <SessionUsageReadout sessionId={evidence.sessionId} usage={evidence.usage} />
          {evidence.contextError ? <p role="alert">{evidence.contextError}</p> : null}
          {evidence.onOpenCanvas ? (
            <Button
              variant="link"
              size="sm"
              className="mt-1 h-6 px-0 text-xs"
              onClick={() => evidence.onOpenCanvas?.('context')}
            >
              {t`Open full context view`}
              <ExternalLinkIcon aria-hidden="true" className="size-3" />
            </Button>
          ) : null}
        </>
      ),
    },
  ];
  if (sources.length || connected.error)
    inventory.push({
      id: 'connected',
      count: sources.length,
      content: connected.error ? (
        <p role="alert">{t`Connected sources could not be loaded.`}</p>
      ) : (
        sources.map((source) => (
          <SessionSummaryRow
            key={source.id}
            icon={<DatabaseIcon />}
            label={source.label}
            onOpen={() => onOpenSource(source)}
          />
        ))
      ),
    });
  if (
    work.error ||
    (evidence.sessionId && evidence.onOpenWork && (work.data?.goal || work.data?.loop))
  )
    inventory.push({
      id: 'goal',
      content: work.error ? (
        <p role="alert">{t`Session work could not be loaded.`}</p>
      ) : (
        <SessionWorkSummary
          sessionId={evidence.sessionId!}
          onOpen={evidence.onOpenWork!}
          includeTodos={false}
        />
      ),
    });
  if (questions.length && answer?.openQuestion)
    inventory.push({
      id: 'questions',
      count: questions.length,
      content: <OpenQuestionList questions={questions} />,
    });
  if (work.data?.plan && evidence.sessionId)
    inventory.push({
      id: 'plan',
      summary: planStatusLabel(work.data.plan.status),
      content: <SessionPlanBody plan={work.data.plan} sessionId={evidence.sessionId} />,
    });
  if (todos.length)
    inventory.push({
      id: 'todos',
      count: todos.length,
      summary: `${todos.filter((todo) => todo.status === 'completed').length} of ${todos.length}`,
      content: (
        <TodoList
          items={todos}
          status={(todo) => todo.status}
          scope="showcase"
          renderItem={(todo, index) => (
            <li key={`${index}:${todo.content}`}>
              <SessionSummaryRow
                icon={<TodoStatusIcon state={todo.status} />}
                label={todo.content}
                metadata={
                  todo.status === 'in_progress'
                    ? t`In progress`
                    : todo.status === 'completed'
                      ? t`Completed`
                      : t`Pending`
                }
                onOpen={evidence.onOpenWork}
              />
            </li>
          )}
        />
      ),
    });
  if (scheduled.length || schedules.error)
    inventory.push({
      id: 'schedules',
      count: scheduled.length,
      content: schedules.error ? (
        <p role="alert">{t`Schedules could not be loaded.`}</p>
      ) : (
        scheduled.map((schedule) => (
          <SessionSummaryRow
            key={schedule.id}
            icon={<CalendarClockIcon />}
            label={schedule.question}
            metadata={schedule.enabled ? 'Scheduled' : 'Paused'}
            onOpen={evidence.onOpenWork}
          />
        ))
      ),
    });
  const pages = browserPages.data ?? [];
  if (pages.length)
    inventory.push({
      id: 'browser',
      count: pages.length,
      content: pages.map((page) => (
        <SessionSummaryRow
          key={page.id}
          icon={<GlobeIcon />}
          label={browserPageLabel(page)}
          metadata={page.host || t`Blank page`}
          title={page.url}
          onOpen={
            evidence.onOpenBrowser
              ? () =>
                  evidence.onOpenBrowser?.({
                    kind: 'browser',
                    pageId: page.id,
                    sessionId: page.session_id,
                    label: browserPageLabel(page),
                  })
              : undefined
          }
        />
      )),
    });
  return <SessionRail items={[...inventory, ...items]} header={header} />;
}
