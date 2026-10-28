import { vocab } from '@/lib/brand-vocabulary';
import { conversationHref, conversationRole } from './conversation-family-navigation';
import type { Artifact, Message, Session } from '@clio/core/v3';
import { ArrowUpRightIcon, FileBoxIcon, GitBranchIcon, HistoryIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MarkdownText } from '@/components/ai-elements/markdown';
import { useConversationPreview } from '@/hooks/use-conversation-preview';
import { isManagedChildSession } from '@/lib/session-state';
import { ConversationRoleIcon } from './conversation-family-label';
import { conversationPreview, previewText } from './conversation-preview-model';

/** A bounded real transcript preview beside the graph, with navigation into the full conversation. */
export function ConversationInspector({
  session,
  sessions,
  onOpenArtifact,
}: {
  session: Session;
  sessions: readonly Session[];
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  const preview = useConversationPreview(session.id);
  const history = conversationPreview(session, preview.messages);
  const parent = sessions.find((candidate) => candidate.id === session.parent_session_id);
  return (
    <aside
      aria-label="Selected conversation"
      className="min-w-0 border-t bg-muted/15 p-4 @min-[48rem]:border-l @min-[48rem]:border-t-0"
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ConversationRoleIcon session={session} className="size-3.5" />
        {conversationRole(session)}
        {isManagedChildSession(session) ? ' (parent owned)' : ''}
      </div>
      <h3 className="mt-1 break-words text-sm font-semibold">{session.title}</h3>
      {parent ? (
        <Link
          className="mt-2 block text-xs text-primary hover:underline"
          to={conversationHref(parent)}
        >
          ← {isManagedChildSession(session) ? 'Owned by' : 'Return to'} {parent.title}
        </Link>
      ) : null}
      <Link
        to={conversationHref(session)}
        className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
      >
        <HistoryIcon className="size-3.5" />
        Full conversation history
      </Link>
      <div aria-label="Conversation preview" className="my-4 space-y-3 text-xs">
        {preview.pending ? (
          <p className="text-muted-foreground">Loading history…</p>
        ) : preview.error ? (
          <p role="status">History preview is unavailable. Open the conversation to retry.</p>
        ) : null}
        {history.copied.map((message) => (
          <PreviewMessage key={message.id} message={message} copied />
        ))}
        {history.origin ? (
          <div className="flex items-center gap-2 text-[11px] text-primary">
            <GitBranchIcon className="size-3.5" />
            <span>
              {history.boundaryRetained ? 'Branched here' : 'Saved fork point, history rewound'}
            </span>
            <span className="flex-1 border-t" />
          </div>
        ) : null}
        {history.continuation.map((message) => (
          <PreviewMessage key={message.id} message={message} />
        ))}
      </div>
      <div className="border-t pt-3">
        <h4 className="text-[11px] text-muted-foreground">Outputs</h4>
        {preview.outputs.map((artifact) => (
          <Button
            key={artifact.id}
            variant="link"
            className="mt-1 h-auto w-full justify-start whitespace-normal px-0 text-left text-xs"
            disabled={!onOpenArtifact}
            onClick={() => onOpenArtifact?.(artifact)}
          >
            <FileBoxIcon className="size-3.5 shrink-0" />
            {artifact.name}
          </Button>
        ))}
        {!preview.outputs.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {preview.outputsError ? 'Outputs unavailable' : 'No output files'}
          </p>
        ) : null}
      </div>
      <Link
        to={conversationHref(session)}
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        {isManagedChildSession(session) ? 'Open subagent' : 'Open conversation'}
        <ArrowUpRightIcon className="size-3.5" />
      </Link>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {isManagedChildSession(session)
          ? 'Controlled by the parent agent'
          : session.parent_session_id
            ? 'Independent conversation with shared files'
            : 'Shared workspace files'}
      </p>
    </aside>
  );
}

function PreviewMessage({ message, copied }: { message: Message; copied?: boolean }) {
  const text = previewText(message);
  if (!text) return null;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{message.role === 'user' ? 'You' : vocab.agent}</span>
        {copied ? <span>Copied</span> : null}
      </div>
      <div className="line-clamp-2 leading-5 [&_p]:my-0 [&_pre]:hidden" title={text}>
        <MarkdownText mode="static">{text}</MarkdownText>
      </div>
    </div>
  );
}
