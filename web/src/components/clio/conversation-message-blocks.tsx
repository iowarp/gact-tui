import type {
  A2UIActionLifecycle,
  A2UISurface,
  Artifact,
  MessageBlock,
  WorkspaceReference,
} from '@clio/core/v3';
import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  FileCode2Icon,
  PanelsTopLeftIcon,
  RouteIcon,
  SyringeIcon,
} from 'lucide-react';
import { createElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import {
  Plan,
  PlanAction,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '@/components/ai-elements/plan';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ClioA2UISurface } from './a2ui-surface';
import { ExternalLink } from '@/components/ui/external-link';
import { McpAppHistoryLine, McpAppSurface } from './mcp-app-surface';
import { ClioArtifactAttachments, ClioArtifactCard } from './artifact-card';
import { ReferencedArtifact } from './referenced-artifact';
import type { ClioConversationProps } from './conversation-types';
import { ConversationProcessSequence } from './conversation-process-sequence';
import { referenceKindLabel } from '@/lib/composer-reference-domain';
import { PROTOCOL } from '@/lib/brand-vocabulary';
import { referenceKindIcon } from './composer-reference-presentation';
import { humanizeProtocolValue } from './presentation-labels';
import { ClioStatus } from './status';
import { TranscriptResourceAttachments } from './transcript-resource-attachment';
import { TranscriptTextBlock } from './transcript-text-block';
import { toolOutputDiffKey } from './declared-diff-key';
import { surfaceAwaitsPendingResponse } from './conversation-message-projection';
import { vocab } from '@/lib/brand-vocabulary';
import { SummarizationInjection, TranscriptNotice } from './conversation-summarization';
import type { MessageAttentionIndex } from '@/lib/attention-tool-index';

type ResourceBlock = Extract<MessageBlock, { type: 'resource' }>;

export function DeferredA2UISurface({
  actionLifecycle,
  surface,
}: {
  actionLifecycle?: A2UIActionLifecycle;
  surface: A2UISurface;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Mount once so the reserved geometry is measured before a completed surface
  // can be suspended. This prevents the transcript from jumping when an older
  // map or chart re-enters the viewport.
  const [nearViewport, setNearViewport] = useState(true);
  const [reservedHeight, setReservedHeight] = useState(1);
  const live = ['creating', 'updating', 'pending_action'].includes(surface.state);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || live || typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }

    const updateProximity = (intersecting = false) => {
      const rect = host.getBoundingClientRect();
      // A virtualized transcript can move the reserved host through a CSS
      // transform without the viewport observer reporting the new position.
      // Check its actual screen bounds on scroll too; otherwise a visible
      // completed surface can remain an empty 68px placeholder.
      setNearViewport(intersecting || (rect.top < window.innerHeight + 800 && rect.bottom > -800));
    };
    const observer = new IntersectionObserver(
      ([entry]) => updateProximity(entry?.isIntersecting ?? false),
      { rootMargin: '800px 0px' },
    );
    observer.observe(host);
    updateProximity();
    window.addEventListener('scroll', onScroll, true);
    function onScroll() {
      updateProximity();
    }
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [live, surface.id]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !nearViewport || typeof ResizeObserver === 'undefined') return;
    const rememberHeight = () => {
      const height = Math.ceil(host.getBoundingClientRect().height);
      if (height > 1) setReservedHeight(height);
    };
    rememberHeight();
    const observer = new ResizeObserver(rememberHeight);
    observer.observe(host);
    return () => observer.disconnect();
  }, [nearViewport]);

  const renderSurface = live || nearViewport;
  // The label belongs on this wrapper only while it IS the accessible
  // content — an empty reserved-height placeholder before the surface has
  // scrolled near. Once mounted, `ClioA2UISurface` renders its own labeled
  // `<section aria-label="Interactive surface, …">`; a named `<section>`
  // carries an implicit `role="region"`, so its `aria-label` is valid, but
  // a bare `<div>` has no role at all — carrying the SAME kind of label
  // here unconditionally put `aria-label` on a role-less div once mounted
  // (an axe `aria-prohibited-attr` violation) and duplicated the surface's
  // own name besides. `role="group"` on the placeholder is enough to make
  // its OWN label valid while it is genuinely all there is to announce.
  return (
    <div
      aria-label={renderSurface ? undefined : `${PROTOCOL.a2ui} surface`}
      data-a2ui-viewport={renderSurface ? 'mounted' : 'deferred'}
      ref={hostRef}
      role={renderSurface ? undefined : 'group'}
      style={renderSurface ? undefined : { minHeight: reservedHeight }}
    >
      {renderSurface ? (
        <ClioA2UISurface actionLifecycle={actionLifecycle} surface={surface} />
      ) : null}
    </div>
  );
}

type MessageBlockViewProps = Omit<ClioConversationProps, 'messages'> & {
  activeMcpAppId?: string;
  block: MessageBlock;
  messageId?: string;
  messageAttentionIndex?: MessageAttentionIndex;
  messageSessionId?: string;
  reasoningDefaultOpen?: boolean;
  compactReferences?: boolean;
};

function MessageBlockView({
  block,
  tools,
  tasks,
  subagents,
  artifacts,
  surfaces,
  actionLifecycles,
  resources,
  onActionCardAction,
  onOpenArtifact,
  onOpenFile,
  onOpenResource,
  onOpenReference,
  onOpenSubagent,
  reasoningDefaultOpen,
  activeMcpAppId,
  mcpAppRepository,
  messageId,
  messageAttentionIndex,
  messageSessionId,
  interactions,
  onInteractionResponse,
  compactReferences,
}: MessageBlockViewProps) {
  switch (block.type) {
    case 'text': {
      return (
        <TranscriptTextBlock
          block={block}
          messageId={messageId}
          compactReferences={compactReferences}
        />
      );
    }
    case 'reasoning':
    case 'tool':
    case 'task':
    case 'subagent':
    case 'agent_message':
      return (
        <ConversationProcessSequence
          block={block}
          artifacts={artifacts}
          messageId={messageId}
          messageAttentionIndex={messageAttentionIndex}
          messageSessionId={messageSessionId}
          onInteractionResponse={onInteractionResponse}
          onOpenArtifact={onOpenArtifact}
          onOpenSubagent={onOpenSubagent}
          reasoningDefaultOpen={reasoningDefaultOpen}
          subagents={subagents}
          tasks={tasks}
          tools={tools}
          interactions={interactions}
        />
      );
    case 'plan':
      return (
        <Plan>
          <PlanHeader>
            <div>
              <PlanTitle>{block.title}</PlanTitle>
              {block.detail ? <PlanDescription>{block.detail}</PlanDescription> : null}
            </div>
            <PlanAction>
              <PlanTrigger />
            </PlanAction>
          </PlanHeader>
        </Plan>
      );
    case 'injection':
      // A variant try's injection renders inside that try's tab, not the turn.
      if (block.variants_id) return null;
      // The generic tool-use prompt is harness guidance, while actual calls
      // already appear in Activity. Showing it as a transcript item looks like
      // a second, unnamed tool call beside the generated surface.
      if (block.source === 'tool_use') return null;
      return block.source === 'summarization' ? (
        <SummarizationInjection block={block} label={INJECTION_LABELS.summarization} />
      ) : (
        <HarnessInjection block={block} />
      );
    case 'notice':
      return <TranscriptNotice block={block} />;
    case 'artifact': {
      const artifact = artifacts[block.artifact_id];
      return artifact ? (
        <ClioArtifactCard artifact={artifact} onOpen={onOpenArtifact} />
      ) : (
        <ReferencedArtifact
          artifactId={block.artifact_id}
          sessionId={messageSessionId ?? ''}
          onOpen={onOpenArtifact}
        />
      );
    }
    case 'action_card':
      return (
        <Alert variant={block.severity === 'critical' ? 'destructive' : 'default'}>
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>{block.title}</AlertTitle>
          <AlertDescription>
            {block.detail}
            {block.source ? (
              <span className="mt-2 block text-xs">Raised by {block.source}</span>
            ) : null}
          </AlertDescription>
          <div className="col-start-2 mt-3 flex flex-wrap gap-2">
            {block.actions.map((action) => (
              <Button
                disabled={!action.enabled || !onActionCardAction}
                key={action.id}
                onClick={() => void onActionCardAction?.(action)}
                size="sm"
                title={!action.enabled ? action.behavior.reason : undefined}
                variant="outline"
              >
                {action.label}
              </Button>
            ))}
          </div>
        </Alert>
      );
    case 'a2ui': {
      const surface = surfaces[block.surface_id];
      if (surfaceAwaitsPendingResponse(interactions, block.surface_id)) return null;
      return surface?.state === 'deleted' ? (
        <ClioStatus label={`${PROTOCOL.a2ui} surface removed`} value="cancelled" />
      ) : surface ? (
        <DeferredA2UISurface
          actionLifecycle={actionLifecycles?.[block.surface_id]}
          surface={surface}
        />
      ) : (
        <ClioStatus label={`${PROTOCOL.a2ui} surface unavailable`} value="unavailable" />
      );
    }
    case 'mcp_app':
      return block.app_instance_id === activeMcpAppId && mcpAppRepository && messageSessionId ? (
        <McpAppSurface
          appInstanceId={block.app_instance_id}
          dataRef={block.data_ref}
          height={block.height}
          repository={mcpAppRepository}
          resourceUri={block.resource_uri}
          sessionId={messageSessionId}
          sourceServer={block.source_server}
          toolName={block.tool_name}
        />
      ) : (
        <McpAppHistoryLine sourceServer={block.source_server} toolName={block.tool_name} />
      );
    case 'citation':
      return (
        <ExternalLink
          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          href={block.uri}
        >
          {block.label}
          <ExternalLinkIcon aria-hidden="true" className="size-3" />
        </ExternalLink>
      );
    case 'diff':
      return (
        <CodeBlock code={block.unified_diff} language="diff" showLineNumbers>
          <CodeBlockHeader>
            <CodeBlockTitle>
              <FileCode2Icon aria-hidden="true" className="size-3.5" />
              <CodeBlockFilename>{block.path}</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              {onOpenFile ? (
                <Button
                  aria-label={`Open ${block.path} in workspace`}
                  onClick={() => onOpenFile(block.path)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <PanelsTopLeftIcon aria-hidden="true" />
                </Button>
              ) : null}
              <CodeBlockCopyButton aria-label={`Copy diff for ${block.path}`} />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      );
    case 'error':
      return (
        <Alert variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>{humanizeProtocolValue(block.code)}</AlertTitle>
          <AlertDescription>
            {block.message}
            {block.recoverable ? ' You can retry this step.' : ''}
          </AlertDescription>
        </Alert>
      );
    case 'routing':
      if (block.label === 'Unknown' && !block.detail) return null;
      return (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
          <RouteIcon aria-hidden="true" className="size-3.5" />
          <span>{block.label}</span>
          {block.detail ? <span>{block.detail}</span> : null}
        </div>
      );
    case 'resource':
      // Reached only for a lone resource block; a run of adjacent ones is
      // grouped into a single grid by MessageBlockSequence below.
      return (
        <TranscriptResourceAttachments
          blocks={[block]}
          onOpen={onOpenResource}
          resources={resources}
        />
      );
    case 'context_reference': {
      const reference: WorkspaceReference = {
        kind: block.ref_kind,
        id: block.ref_id,
        label: block.label,
        // The transcript block carries no description of its own. Repeating the
        // label here would invent one, and every surface downstream would read
        // it as something the service said.
        detail: '',
        media_type: block.media_type,
        revision: block.revision,
        navigation: block.navigation,
      };
      const kind = referenceKindLabel(block.ref_kind);
      return (
        <button
          aria-label={`Open referenced ${kind} ${block.label}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          // The revision is an addressing token, not something to read. It stays
          // available for support and correlation without being shown.
          data-reference-revision={block.revision}
          disabled={!onOpenReference}
          onClick={() => onOpenReference?.(reference)}
          title={kind}
          type="button"
        >
          {createElement(referenceKindIcon(block.ref_kind), {
            'aria-hidden': 'true',
            className: 'size-3.5 shrink-0',
          })}
          <span className="truncate">{block.label}</span>
        </button>
      );
    }
    case 'unknown':
      return (
        <Alert>
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>New message content</AlertTitle>
          <AlertDescription>
            This service sent a {humanizeProtocolValue(block.original_type)} block that this version
            cannot display yet. The rest of the conversation remains available.
          </AlertDescription>
        </Alert>
      );
  }
}

type InjectionBlock = Extract<MessageBlock, { type: 'injection' }>;

const INJECTION_LABELS: Record<string, string> = {
  todos: 'Todo list',
  plan_mode: 'Plan reminder',
  replan: 'Replanning suggestion',
  memory_search: 'Memory search results',
  task_results: 'Results from background tasks',
  path_hint: 'Path suggestion',
  circuit_breaker: 'Repeated-failure warning',
  result_spilled: 'Large result saved to a file',
  hook: 'Hook',
  summarization: 'Summarization',
  variant_drafting: 'Drafting alternatives',
  variant_advice: 'Advice for this draft',
};

/**
 * Harness data the agent was given (a syringe: CLIO put this into the agent's
 * context). Collapsed to what it is; expanded to exactly the text the agent got,
 * so the user sees the same thing the agent saw.
 */
export function HarnessInjection({ block }: { block: InjectionBlock }) {
  const [expanded, setExpanded] = useState(false);
  const label = INJECTION_LABELS[block.source] ?? humanizeProtocolValue(block.source);
  return (
    <section className="min-w-0 max-w-full" data-slot="harness-injection">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-muted-foreground">
        <SyringeIcon aria-hidden="true" className="size-4 shrink-0" />
        <span>
          {vocab.product} gave the agent: {label}
        </span>
        <button
          aria-expanded={expanded}
          className="text-xs font-medium text-primary underline-offset-2 hover:text-primary/80 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? 'Hide' : 'Show what it got'}
        </button>
      </div>
      {expanded ? (
        <pre className="mt-2 min-w-0 max-w-full whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs leading-5">
          {block.text}
        </pre>
      ) : null}
    </section>
  );
}

export function MessageBlockSequence({
  blocks,
  resourcesFirst = false,
  ...props
}: Omit<MessageBlockViewProps, 'block'> & {
  blocks: readonly MessageBlock[];
  resourcesFirst?: boolean;
}) {
  const uniqueBlocks = [...new Map(blocks.map((block) => [block.id, block] as const)).values()];
  const orderedBlocks = resourcesFirst
    ? [
        ...uniqueBlocks.filter((block) => block.type === 'resource'),
        ...uniqueBlocks.filter((block) => block.type !== 'resource'),
      ]
    : uniqueBlocks;
  const rendered: ReactNode[] = [];
  const inlineDiffs = new Set(
    orderedBlocks.flatMap((block) => {
      if (block.type !== 'tool') return [];
      const key = toolOutputDiffKey(props.tools[block.tool_id]);
      return key ? [key] : [];
    }),
  );
  let index = 0;

  while (index < orderedBlocks.length) {
    const block = orderedBlocks[index];
    if (!block) break;
    const keyIndex = index;

    if (block.type === 'diff' && inlineDiffs.has(`${block.path}\u0000${block.unified_diff}`)) {
      index += 1;
      continue;
    }

    if (block.type === 'resource') {
      const resourceBlocks: ResourceBlock[] = [];
      const firstBlockId = block.id;
      while (index < orderedBlocks.length) {
        const candidate = orderedBlocks[index];
        if (candidate?.type !== 'resource') break;
        resourceBlocks.push(candidate);
        index += 1;
      }
      rendered.push(
        <TranscriptResourceAttachments
          blocks={resourceBlocks}
          key={`resource-attachments-${firstBlockId}-${keyIndex}`}
          onOpen={props.onOpenResource}
          resources={props.resources}
        />,
      );
      continue;
    }

    if (block.type !== 'artifact' || !props.artifacts[block.artifact_id]) {
      rendered.push(<MessageBlockView block={block} key={`${block.id}-${keyIndex}`} {...props} />);
      index += 1;
      continue;
    }

    const artifacts: Artifact[] = [];
    const firstBlockId = block.id;
    while (index < orderedBlocks.length) {
      const candidate = orderedBlocks[index];
      if (!candidate || candidate.type !== 'artifact') break;
      const artifact = props.artifacts[candidate.artifact_id];
      if (!artifact) break;
      artifacts.push(artifact);
      index += 1;
    }
    rendered.push(
      <ClioArtifactAttachments
        artifacts={artifacts}
        key={`artifact-attachments-${firstBlockId}-${keyIndex}`}
        onOpen={props.onOpenArtifact}
      />,
    );
  }

  return rendered;
}
