import type { A2UISurface, Artifact, MessageBlock } from '@clio/core/v3';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  FileCode2Icon,
  PanelsTopLeftIcon,
  RouteIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import { MessageResponse } from '@/components/ai-elements/message';
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
import { ClioArtifactAttachments, ClioArtifactCard } from './artifact-card';
import type { ClioConversationProps } from './conversation';
import { ConversationProcessSequence } from './conversation-process-sequence';
import { humanizeProtocolValue } from './presentation-labels';
import { ClioStatus } from './status';
import { ClioStreamingText } from './streaming-text';

export function DeferredA2UISurface({
  onLocalAction,
  surface,
}: {
  onLocalAction?: (action: A2uiClientAction) => string | void | Promise<string | void>;
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

    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry?.isIntersecting ?? false),
      { rootMargin: '800px 0px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
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
  return (
    <div
      data-a2ui-viewport={renderSurface ? 'mounted' : 'deferred'}
      ref={hostRef}
      style={renderSurface ? undefined : { minHeight: reservedHeight }}
    >
      {renderSurface ? <ClioA2UISurface onLocalAction={onLocalAction} surface={surface} /> : null}
    </div>
  );
}

type MessageBlockViewProps = Omit<ClioConversationProps, 'messages'> & {
  block: MessageBlock;
  reasoningDefaultOpen?: boolean;
};

function MessageBlockView({
  block,
  tools,
  tasks,
  subagents,
  artifacts,
  surfaces,
  onActionCardAction,
  onA2UILocalAction,
  onOpenArtifact,
  onOpenFile,
  onOpenSubagent,
  reasoningDefaultOpen,
}: MessageBlockViewProps) {
  switch (block.type) {
    case 'text':
      return block.streaming ? (
        <ClioStreamingText className="leading-7" active text={block.text} />
      ) : (
        <MessageResponse>{block.text}</MessageResponse>
      );
    case 'reasoning':
    case 'tool':
    case 'task':
    case 'subagent':
      return (
        <ConversationProcessSequence
          block={block}
          onOpenSubagent={onOpenSubagent}
          reasoningDefaultOpen={reasoningDefaultOpen}
          subagents={subagents}
          tasks={tasks}
          tools={tools}
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
    case 'artifact': {
      const artifact = artifacts[block.artifact_id];
      return artifact ? (
        <ClioArtifactCard artifact={artifact} onOpen={onOpenArtifact} />
      ) : (
        <Alert>
          <PanelsTopLeftIcon aria-hidden="true" />
          <AlertTitle>Artifact unavailable</AlertTitle>
          <AlertDescription>
            The message refers to an artifact the service did not return.
          </AlertDescription>
        </Alert>
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
      return surface?.state === 'deleted' ? (
        <ClioStatus label="Interactive surface removed" value="cancelled" />
      ) : surface ? (
        <DeferredA2UISurface onLocalAction={onA2UILocalAction} surface={surface} />
      ) : (
        <ClioStatus label="Interactive surface unavailable" value="unavailable" />
      );
    }
    case 'citation':
      return (
        <a
          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          href={block.uri}
          rel="noreferrer"
          target="_blank"
        >
          {block.label}
          <ExternalLinkIcon aria-hidden="true" className="size-3" />
        </a>
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
      return (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
          <RouteIcon aria-hidden="true" className="size-3.5" />
          <span>{block.label}</span>
          {block.detail ? <span>{block.detail}</span> : null}
        </div>
      );
    case 'resource':
      // Human-message resources are grouped above prose by ConversationMessageRow.
      return null;
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

export function MessageBlockSequence({
  blocks,
  ...props
}: Omit<MessageBlockViewProps, 'block'> & { blocks: readonly MessageBlock[] }) {
  const rendered: ReactNode[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];
    if (!block) break;
    if (block.type !== 'artifact' || !props.artifacts[block.artifact_id]) {
      rendered.push(<MessageBlockView block={block} key={block.id} {...props} />);
      index += 1;
      continue;
    }

    const artifacts: Artifact[] = [];
    const firstBlockId = block.id;
    while (index < blocks.length) {
      const candidate = blocks[index];
      if (!candidate || candidate.type !== 'artifact') break;
      const artifact = props.artifacts[candidate.artifact_id];
      if (!artifact) break;
      artifacts.push(artifact);
      index += 1;
    }
    rendered.push(
      <ClioArtifactAttachments
        artifacts={artifacts}
        key={`artifact-attachments-${firstBlockId}`}
        onOpen={props.onOpenArtifact}
      />,
    );
  }

  return rendered;
}
