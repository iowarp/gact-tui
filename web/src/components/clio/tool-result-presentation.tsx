import { CircleAlertIcon, FileIcon } from 'lucide-react';
import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { Terminal, TerminalCommand, TerminalContent } from '@/components/ai-elements/terminal';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { BoundedResult } from './bounded-result';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';
import { PresentationLink } from './presentation-link';
import { languageForPath } from '@/lib/code-language';
import { cn } from '@/lib/utils';
import {
  BlockBody,
  PagedBlock,
  PresentationItem,
  ProviderRefreshResults,
  SchedulePresentationItem,
} from './tool-result-primitives';
import {
  DefaultBlockPanel,
  MemorySearchResults,
  MemorySessionSummary,
  ResourceConversionResult,
  ResourceFacts,
  ResourceSearchResults,
  ResourceStructureResult,
} from './tool-result-resource-memory';
import { isProvenanceBlock } from './tool-result-shared';

/** Render only the declared presentation contract. Raw results stay technical. */
export function ToolResultPresentation({
  tool,
  subjectId,
  summaryInHeader = false,
}: {
  tool: ToolInvocation;
  subjectId?: string;
  summaryInHeader?: boolean;
}) {
  const lines = useTranscriptPreviewLines();
  const subject = tool.presentation?.blocks.find((block) => block.id === subjectId);
  const resourceDocument =
    tool.name === 'workspace_resource_read' && subject?.target === 'resource';
  const subjectPath =
    subject?.target === 'file'
      ? subject.uri || subject.label || ''
      : subject?.target === 'resource'
        ? subject.label || subject.uri || ''
        : '';
  const blocks = (tool.presentation?.blocks ?? [])
    .filter(
      (block) =>
        block.id !== subjectId &&
        (!['text', 'markdown'].includes(block.type) || block.text?.trim() || block.content_ref),
    )
    .map((block) => {
      if (resourceDocument && block.type === 'text')
        return { ...block, type: 'code' as const, language: languageForPath(subjectPath) };
      return block.type === 'code' && !block.language && subjectPath
        ? { ...block, language: languageForPath(subjectPath) }
        : block;
    });
  const summary = summaryInHeader ? '' : (tool.presentation?.summary?.trim() ?? '');
  // An explicitly declared file subject owns one document preview, including
  // metadata. Do not give each constituent block another preview-line budget.
  // Provenance blocks are ignored for this decision (see isProvenanceBlock)
  // and rendered after the document instead.
  const contentBlocks = blocks.filter((block) => !isProvenanceBlock(block));
  const provenanceBlocks = blocks.filter(isProvenanceBlock);
  const document =
    (subject?.target === 'file' || resourceDocument) &&
    contentBlocks.length > 0 &&
    contentBlocks.every((block) => ['text', 'markdown', 'code', 'diff'].includes(block.type));
  if (document) {
    const budget = contentBlocks.some((block) => block.type === 'diff') ? lines * 2 : lines;
    return (
      <div className="ml-7 flex min-w-0 flex-col gap-0.5" data-slot="tool-human-result">
        {summary ? (
          <p className="whitespace-pre-wrap pr-2 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {summary}
          </p>
        ) : null}
        <div
          className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
          data-slot="tool-result-panel"
        >
          {contentBlocks.some((block) => block.content_ref) ? (
            <PagedBlock block={contentBlocks[0]} groupedBlocks={contentBlocks} lines={budget} />
          ) : (
            <BoundedResult lines={budget} title={subject.label || 'File contents'}>
              {contentBlocks.map((block) => (
                <BlockBody key={block.id} block={block} text={block.text ?? ''} />
              ))}
            </BoundedResult>
          )}
        </div>
        {provenanceBlocks.map((block) =>
          block.type === 'link' ? (
            <PresentationLink key={block.id} block={block} />
          ) : (
            <DefaultBlockPanel key={block.id} block={block} lines={lines} running={false} />
          ),
        )}
      </div>
    );
  }
  if (tool.name === 'workspace_resource_wait') {
    return (
      <div className="ml-7 min-w-0" data-slot="tool-human-result">
        <ResourceConversionResult blocks={blocks} />
      </div>
    );
  }
  if (tool.name === 'workspace_resource_inspect') {
    return (
      <div className="ml-7 min-w-0" data-slot="tool-human-result">
        <ResourceFacts blocks={blocks} />
      </div>
    );
  }
  if (tool.name === 'workspace_resource_structure') {
    return (
      <div className="ml-7 min-w-0" data-slot="tool-human-result">
        <ResourceStructureResult blocks={blocks} tool={tool} />
      </div>
    );
  }
  const resourceListBlocks =
    tool.name === 'workspace_resource_list'
      ? blocks.filter((block) => block.type === 'link' && block.target === 'resource')
      : [];
  if (resourceListBlocks.length) {
    return (
      <div className="ml-7 flex min-w-0 flex-col gap-0.5" data-slot="tool-human-result">
        {summary ? (
          <p className="whitespace-pre-wrap pr-2 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {summary}
          </p>
        ) : null}
        <div
          className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
          data-slot="tool-result-panel"
        >
          <BoundedResult lines={3} unit="items" title="Workspace resources">
            <ul aria-label="Workspace resources" className="divide-y">
              {resourceListBlocks.map((resource) => (
                <li className="flex min-w-0 items-center gap-2 px-2 py-1.5" key={resource.id}>
                  <FileIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                  <PresentationLink block={resource} />
                </li>
              ))}
            </ul>
          </BoundedResult>
        </div>
      </div>
    );
  }
  const resourceSearchBlock =
    tool.name === 'workspace_resource_search' && subject?.target === 'resource'
      ? blocks.find((block) => block.type === 'text')
      : undefined;
  if (resourceSearchBlock && subject) {
    return (
      <div className="ml-7 flex min-w-0 flex-col gap-0.5" data-slot="tool-human-result">
        {summary ? (
          <p className="whitespace-pre-wrap pr-2 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {summary}
          </p>
        ) : null}
        <ResourceSearchResults block={resourceSearchBlock} resource={subject} lines={lines} />
      </div>
    );
  }
  if (tool.name === 'memory_search_sessions') {
    return (
      <div className="ml-7 min-w-0" data-slot="tool-human-result">
        <MemorySearchResults blocks={blocks} summary={summary} />
      </div>
    );
  }
  if (tool.name === 'memory_read_session_summary' && tool.state === 'succeeded') {
    return (
      <div className="ml-7 min-w-0" data-slot="tool-human-result">
        <MemorySessionSummary blocks={blocks} summary={summary} />
      </div>
    );
  }
  const providerRefreshBlocks =
    tool.name === 'refresh_provider_models'
      ? blocks.filter((block) => block.type === 'item' && block.target !== 'work')
      : [];
  if (providerRefreshBlocks.length) {
    return (
      <div className="ml-7 min-w-0" data-slot="tool-human-result">
        <ProviderRefreshResults blocks={providerRefreshBlocks} />
      </div>
    );
  }
  return (
    <div className="ml-7 flex min-w-0 flex-col gap-0.5" data-slot="tool-human-result">
      {tool.progress_message && tool.state === 'running' ? (
        <Shimmer>{tool.progress_message}</Shimmer>
      ) : null}
      {summary ? (
        <p className="whitespace-pre-wrap pr-2 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {summary}
        </p>
      ) : null}
      {blocks.map((block, index) => {
        const collectedChildOutput =
          (tool.name === 'get_agent_task_output' || tool.presentation?.action === 'Collect') &&
          block.type === 'markdown';
        const budget = collectedChildOutput
          ? Math.min(lines, 2)
          : block.type === 'diff'
            ? lines * 2
            : lines;
        const running = block.type === 'terminal' && tool.state === 'running';
        if (block.type === 'link') {
          return <PresentationLink key={block.id} block={block} />;
        }
        if (block.type === 'item') {
          if (block.target === 'work') {
            if (blocks[index - 1]?.type === 'item' && blocks[index - 1]?.target === 'work')
              return null;
            const schedules: ToolPresentationBlock[] = [];
            for (
              let i = index;
              i < blocks.length && blocks[i].type === 'item' && blocks[i].target === 'work';
              i++
            )
              schedules.push(blocks[i]);
            return (
              <BoundedResult key={block.id} lines={3} unit="items" title="Schedules">
                <ul aria-label="Schedules" className="border-l pl-3">
                  {schedules.map((schedule) => (
                    <SchedulePresentationItem key={schedule.id} block={schedule} />
                  ))}
                </ul>
              </BoundedResult>
            );
          }
          return <PresentationItem key={block.id} block={block} />;
        }
        if (block.type === 'check') {
          if (blocks[index - 1]?.type === 'check') return null;
          const checks: ToolPresentationBlock[] = [];
          for (let i = index; i < blocks.length && blocks[i].type === 'check'; i++)
            checks.push(blocks[i]);
          return (
            <BoundedResult
              key={block.id}
              lines={3}
              unit="items"
              title={
                checks.some((check) => check.change && check.change !== 'unchanged')
                  ? 'Task changes'
                  : 'Task list'
              }
            >
              <ul className="list-none">
                {checks.map((check) => (
                  <li key={check.id}>
                    {check.content_ref ? (
                      <PagedBlock block={check} lines={lines} />
                    ) : (
                      <BlockBody block={check} text={check.text ?? ''} />
                    )}
                  </li>
                ))}
              </ul>
            </BoundedResult>
          );
        }
        if (block.type === 'terminal')
          return (
            <Terminal
              key={`${block.id}:${running}`}
              output={block.text ?? ''}
              autoScroll={false}
              isStreaming={running}
            >
              {block.command ? <TerminalCommand command={block.command} /> : null}
              {block.content_ref && !running ? (
                <PagedBlock block={block} lines={budget} />
              ) : (
                <BoundedResult lines={budget} running={running} title="Terminal output">
                  <TerminalContent className="max-h-none overflow-visible bg-zinc-950 p-3 text-zinc-100" />
                </BoundedResult>
              )}
              {!running && (block.timed_out || block.exit_code !== undefined) ? (
                <p className="border-t border-zinc-800 px-3 py-2 text-sm text-zinc-400">
                  {block.timed_out
                    ? 'Process timed out.'
                    : `Process exited with code ${block.exit_code}.`}
                </p>
              ) : null}
            </Terminal>
          );
        const boxed =
          block.severity === 'error' ||
          block.severity === 'warning' ||
          ['code', 'diff', 'media'].includes(block.type);
        if (!boxed) {
          if (block.content_ref && !running)
            return <PagedBlock key={block.id} block={block} lines={budget} />;
          // Every non-boxed block gets the same bounded preview (a "Show
          // more" affordance only appears once content actually exceeds the
          // line budget; short content -- most labeled text blocks -- renders
          // exactly as before with no visible wrapper chrome).
          return (
            <div key={block.id} className="min-w-0">
              {block.label ? (
                <p className="text-xs font-medium text-muted-foreground">{block.label}</p>
              ) : null}
              <BoundedResult
                lines={budget}
                title={collectedChildOutput ? 'Collected child output' : (block.label ?? undefined)}
              >
                <BlockBody block={block} text={block.text ?? ''} />
              </BoundedResult>
            </div>
          );
        }
        return (
          <div
            key={`${block.id}:${running ? 'running' : 'complete'}`}
            className={cn(
              'min-w-0 overflow-hidden rounded-md border',
              block.severity === 'error'
                ? 'border-destructive/40 bg-destructive/5'
                : block.severity === 'warning'
                  ? 'border-warning/40 bg-warning/5'
                  : 'bg-muted/40',
            )}
            data-slot="tool-result-panel"
          >
            {block.label ? (
              <p
                className={cn(
                  'flex items-center gap-1 break-words px-2 pt-1 text-xs font-medium',
                  block.severity === 'error' ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {block.severity === 'error' ? (
                  <CircleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
                ) : null}
                {block.label}
              </p>
            ) : null}
            {block.content_ref && !running ? (
              <PagedBlock block={block} lines={budget} />
            ) : (
              <BoundedResult
                lines={budget}
                running={running}
                separateViewer={block.type === 'media'}
                fullContent={
                  block.type === 'media' ? (
                    <BlockBody block={block} text={block.text ?? ''} full />
                  ) : undefined
                }
              >
                <BlockBody block={block} text={block.text ?? ''} />
              </BoundedResult>
            )}
          </div>
        );
      })}
    </div>
  );
}
