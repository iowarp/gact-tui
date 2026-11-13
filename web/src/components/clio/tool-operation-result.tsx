import { useEffect, useState } from 'react';
import type { ToolInvocation } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ContentMarkdown } from './content-markdown';
import { BoundedResult } from './bounded-result';
import { PagedBlock } from './tool-result-primitives';
import { PresentationLink } from './presentation-link';
import { ToolOperationValue } from './tool-operation-value';
import { operationAnswer, type OperationTask } from './tool-operation-data';
import type { ToolOperation } from './tool-operation';
import { asRecord } from './tool-result-shared';
import { ToolOperationSearch } from './tool-operation-search';
import { useRepository } from '@/hooks/use-repository';
import { readOperationPages } from './tool-operation-paging';
import { copyText } from '@/lib/clipboard';
import { clioStatusLabel, type ClioStatusValue } from './status';
import { t, ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

const STATUS_WORDS = new Set(['failed', 'cancelled', 'interrupted', 'denied']);

/** A returned task's unsuccessful status in words, for its tab; a completed one stays quiet. */
function statusWords(task: OperationTask): string | undefined {
  if (task.error && !task.status) return t`Could not collect`;
  return task.status && STATUS_WORDS.has(task.status)
    ? clioStatusLabel(task.status as ClioStatusValue)
    : undefined;
}

/** One operation-wide readable preview, without an inner scroll viewport. */
function Answer({ value, markdown = false }: { value: unknown; markdown?: boolean }) {
  if (typeof value !== 'string') return <ToolOperationValue value={value} />;
  return (
    <BoundedResult lines={8} title={t`Result`} inlineExpansion>
      {markdown ? (
        <ContentMarkdown className="text-sm leading-6">{value}</ContentMarkdown>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{value}</p>
      )}
    </BoundedResult>
  );
}

function PinnedAnswer({ task, sessionId }: { task: OperationTask; sessionId: string }) {
  const repository = useRepository();
  const pageKey = JSON.stringify(task.page);
  const [state, setState] = useState<{
    pending: boolean;
    value?: unknown;
    error?: string;
    key: string;
  }>({
    pending: true,
    key: pageKey,
  });
  useEffect(() => {
    const controller = new AbortController();
    void readOperationPages(
      JSON.parse(pageKey) as Record<string, unknown>,
      (cursor, signal) => repository.taskResultPage(sessionId, task.key, cursor, signal),
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setState({ pending: false, value, key: pageKey });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            pending: false,
            key: pageKey,
            error: error instanceof Error ? error.message : t`Unable to read recorded result.`,
          });
      });
    return () => controller.abort();
  }, [repository, sessionId, task.key, pageKey]);
  return state.pending || state.key !== pageKey ? (
    <p role="status" className="text-sm text-muted-foreground">
      {t`Loading recorded result…`}
    </p>
  ) : state.error ? (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  ) : (
    <Answer value={state.value} markdown />
  );
}

/** The assigned task's subject link, with the agent and model it runs as when known. */
function TaskSubjectLine({ task }: { task: OperationTask }) {
  const agent = task.agent ?? '';
  const model = task.model ?? '';
  const subject = <PresentationLink block={task.subject} />;
  if (agent && model)
    return (
      <Trans>
        {subject} running as {agent} on {model}
      </Trans>
    );
  if (agent)
    return (
      <Trans>
        {subject} running as {agent}
      </Trans>
    );
  if (model)
    return (
      <Trans>
        {subject} on {model}
      </Trans>
    );
  return subject;
}

function TaskContent({
  task,
  assignment,
  sessionId,
}: {
  task: OperationTask;
  assignment: boolean;
  sessionId: string;
}) {
  return (
    <div className="min-w-0 space-y-3">
      {assignment ? (
        <>
          <p className="text-sm">
            <TaskSubjectLine task={task} />
          </p>
          {task.assignment ? (
            <div>
              <p className="mb-1 text-sm font-medium">{t`Assignment`}</p>
              <Answer value={task.assignment} />
            </div>
          ) : null}
        </>
      ) : null}
      {!assignment && task.model ? (
        <p className="text-xs text-muted-foreground">{t`Ran on ${ph({ model: task.model })}`}</p>
      ) : null}
      {task.error ? (
        <p className="whitespace-pre-wrap text-sm text-destructive" role="alert">
          {task.error}
        </p>
      ) : null}
      {task.value !== undefined ? <Answer value={task.value} markdown /> : null}
      {task.page ? <PinnedAnswer task={task} sessionId={sessionId} /> : null}
      {task.blocks?.map((block) => (
        <PagedBlock
          block={block}
          key={block.id}
          lines={8}
          renderBlock={(_item, text, complete) => {
            // Only a complete recorded completion envelope is decoded. A clipped
            // preview is never parsed or replaced by a newer child conversation.
            if (!complete)
              return (
                <p className="text-sm text-muted-foreground">{t`Recorded result is incomplete.`}</p>
              );
            let value: unknown = text;
            if (block.result_kind === 'completion') {
              try {
                const parsed: unknown = JSON.parse(text);
                if (asRecord(parsed)) value = operationAnswer(parsed);
              } catch {
                /* The returned answer is ordinary text. */
              }
            }
            return (
              <Answer
                value={value}
                markdown={block.type === 'markdown' || typeof value === 'string'}
              />
            );
          }}
        />
      ))}
    </div>
  );
}

/** Shared task tabs, assignments and literal result readers. Only the selected tab is mounted. */
export function ToolOperationResult({
  operation,
  tool,
}: {
  operation: ToolOperation;
  tool: ToolInvocation;
}) {
  const tasks = operation.tasks ?? [];
  const [selected, setSelected] = useState(tasks[0]?.key ?? '');
  const [copied, setCopied] = useState(false);
  if (operation.kind === 'matches')
    return (
      <div className="ml-7 min-w-0 space-y-3" data-slot="tool-human-result">
        {tasks.map((task) => (
          <div key={task.key} className="border-b py-2">
            <PresentationLink block={task.subject} />
            {task.assignment ? <Answer value={task.assignment} /> : null}
            {task.blocks?.map((block) => <PagedBlock key={block.id} block={block} lines={4} />)}
          </div>
        ))}
      </div>
    );
  if (operation.kind === 'search')
    return (
      <div className="ml-7 min-w-0" data-slot="tool-human-result">
        <ToolOperationSearch value={operation.value} />
      </div>
    );
  if (operation.kind === 'message' || operation.kind === 'value')
    return (
      <div className="ml-7 min-w-0 space-y-2" data-slot="tool-human-result">
        <Answer
          value={operation.value}
          markdown={operation.kind === 'message' || tool.name === 'get_task_result'}
        />
      </div>
    );
  if (!tasks.length) return null;
  const assignment = operation.kind === 'assignments';
  const current = tasks.some((task) => task.key === selected) ? selected : tasks[0].key;
  const selectedTask = tasks.find((task) => task.key === current);
  const copyBody = assignment ? selectedTask?.assignment : selectedTask?.value;
  return (
    <div className="ml-7 min-w-0" data-slot="tool-human-result">
      {/* One task is already named by the row; only several need tabs to choose between. */}
      {tasks.length === 1 ? (
        <TaskContent task={tasks[0]} assignment={assignment} sessionId={tool.session_id} />
      ) : (
        <Tabs
          value={current}
          onValueChange={(value) => {
            setSelected(value);
            setCopied(false);
          }}
        >
          <TabsList
            className="h-auto w-full max-w-full flex-wrap justify-start gap-1 bg-transparent p-0 group-data-horizontal/tabs:h-auto"
            aria-label={assignment ? t`Delegated assignments` : t`Returned task results`}
          >
            {tasks.map((task) => (
              <TabsTrigger
                value={task.key}
                key={task.key}
                className="h-auto min-w-0 max-w-full flex-none px-3 py-1.5 text-sm"
                title={task.subject.label || task.key}
              >
                <span className="max-w-64 truncate">{task.subject.label || task.key}</span>
                {!assignment && statusWords(task) ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {statusWords(task)}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {tasks.map((task) => (
            <TabsContent value={task.key} key={task.key} className="min-w-0 pt-3">
              {current === task.key ? (
                <TaskContent task={task} assignment={assignment} sessionId={tool.session_id} />
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      )}
      {tasks.length > 1 && typeof copyBody === 'string' ? (
        <Button
          className="mt-3 h-auto p-0 text-sm"
          variant="link"
          onClick={async () => {
            try {
              await copyText(copyBody);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? t`Copied` : t`Copy`}
        </Button>
      ) : null}
    </div>
  );
}
