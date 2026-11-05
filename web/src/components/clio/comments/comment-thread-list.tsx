import type { ArtifactReview } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioStatus } from '../status';
import { anchorPreview } from './comment-model';
import { commentThreadsKey } from './comment-session';

type StatusValue = Parameters<typeof ClioStatus>[0]['value'];

/** A thread's state as icon and words (never by colour alone). */
function threadStatus(thread: ArtifactReview): { value: StatusValue; label: string } {
  if (thread.reply_error) return { value: 'failed', label: 'The agent’s turn failed' };
  if (thread.reply_text) return { value: 'completed', label: 'Answered' };
  switch (thread.status) {
    case 'draft':
      return { value: 'pending', label: 'Draft, not sent' };
    case 'queued':
      return { value: 'queued', label: 'Waiting to send' };
    case 'dispatched':
      return { value: 'running', label: 'With the agent' };
    case 'human-note':
      return { value: 'stopped', label: 'Note, not sent to the agent' };
    case 'failed':
      return { value: 'failed', label: 'Not sent' };
    default:
      return { value: 'unavailable', label: 'Stale' };
  }
}

function anchorState(thread: ArtifactReview, headVersion: number): string {
  if (thread.artifact_version === headVersion) return '';
  if (thread.anchor.profile === 'region') return `Made on version ${thread.artifact_version}; shown beside the newest`;
  if (thread.anchor_state === 'moved') return `Moved to version ${headVersion}`;
  if (thread.anchor_state === 'outdated') return `Outdated: version ${headVersion} changed this part`;
  return `Made on version ${thread.artifact_version}`;
}

function Crop({ threadId, side, label }: { threadId: string; side: 'before' | 'after'; label: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const crop = useQuery({
    queryKey: queryKeys.key('comment-crop', settings.endpoint, threadId, side),
    queryFn: ({ signal }) => repository.commentCrop(threadId, side, signal),
    retry: false,
  });
  const url = useMemo(
    () =>
      crop.data
        ? URL.createObjectURL(new Blob([crop.data as BlobPart], { type: 'image/png' }))
        : undefined,
    [crop.data],
  );
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  if (crop.isError) return <p className="text-xs text-muted-foreground">{label}: no crop</p>;
  return (
    <figure className="min-w-0 flex-1">
      {url ? <img alt={label} className="max-h-40 w-full rounded border object-contain" src={url} /> : null}
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/**
 * The thread list beside a document (comments plan, "Threads in the document"): each mark's
 * label, where it points, the comment, the agent's reply and the version it made, its
 * re-anchoring state, and for a region on an older version, before and after.
 */
export function CommentThreadList({ artifactId, sessionId }: { artifactId: string; sessionId: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const threads = useQuery({
    queryKey: commentThreadsKey(settings.endpoint, artifactId),
    queryFn: ({ signal }) => repository.commentThreads(artifactId, sessionId, signal),
    refetchInterval: (query) =>
      query.state.data?.threads.some((row) => row.status === 'dispatched' && !row.reply_text)
        ? 3_000
        : false,
  });
  if (threads.isPending) return <p className="p-3 text-sm text-muted-foreground">Loading comments…</p>;
  if (threads.isError)
    return (
      <p className="p-3 text-sm text-destructive" role="alert">
        {threads.error.message}
      </p>
    );
  const head = threads.data.head;
  const rows = threads.data.threads.filter((row) => row.status !== 'draft');
  if (!rows.length)
    return (
      <p className="p-3 text-sm text-muted-foreground">
        No comments yet. Use Comment to mark text, a region or an element and tell the agent what to change.
      </p>
    );
  return (
    <ol aria-label="Comment threads" className="space-y-3 p-3" data-slot="comment-thread-list">
      {rows.map((thread) => {
        const status = threadStatus(thread);
        const state = anchorState(thread, head.version);
        const older = thread.artifact_version !== head.version;
        return (
          <li className="rounded-md border p-3 text-sm" data-thread-label={thread.label} key={thread.id}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
                {thread.label || '•'}
              </span>
              <ClioStatus compact detail={thread.reply_error || thread.error} label={status.label} value={status.value} />
              <span className="text-xs text-muted-foreground">Version {thread.artifact_version}</span>
            </div>
            <p className="truncate text-xs text-muted-foreground" title={anchorPreview(thread.anchor)}>
              {anchorPreview(thread.anchor)}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{thread.text || '(no comment)'}</p>
            {state ? <p className="mt-1 text-xs text-muted-foreground">{state}</p> : null}
            {thread.reply_text ? (
              <blockquote className="mt-2 border-l-2 pl-2 whitespace-pre-wrap text-muted-foreground">
                {thread.reply_text}
              </blockquote>
            ) : null}
            {thread.reply_version_artifact_id ? (
              <p className="mt-1 text-xs">The agent made a new version.</p>
            ) : null}
            {older && (thread.anchor.profile === 'region' || thread.anchor.profile === 'dom') ? (
              <div className="mt-2 flex gap-2" data-slot="comment-compare">
                <Crop label={`Before, version ${thread.artifact_version}`} side="before" threadId={thread.id} />
                <Crop label={`After, version ${head.version}`} side="after" threadId={thread.id} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
