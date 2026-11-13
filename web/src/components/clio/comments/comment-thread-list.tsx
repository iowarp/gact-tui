import type { ArtifactReview } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { MessageResponse } from '@/components/ai-elements/message';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioStatus } from '../status';
import { anchorPreview } from './comment-model';
import { commentThreadsKey } from './comment-session';
import { plural, t, ph } from '@lingui/core/macro';

type StatusValue = Parameters<typeof ClioStatus>[0]['value'];

/** A thread's state as icon and words (never by colour alone). */
function threadStatus(thread: ArtifactReview): { value: StatusValue; label: string } {
  if (thread.reply_error) return { value: 'failed', label: t`The agent’s turn failed` };
  if (thread.reply_text) return { value: 'completed', label: t`Answered` };
  switch (thread.status) {
    case 'draft':
      return { value: 'pending', label: t`Draft, not sent` };
    case 'queued':
      return { value: 'queued', label: t`Waiting to send` };
    case 'dispatched':
      return { value: 'running', label: t`With the agent` };
    case 'human-note':
      return { value: 'stopped', label: t`Note, not sent to the agent` };
    case 'failed':
      return { value: 'failed', label: t`Not sent` };
    default:
      return { value: 'unavailable', label: t`Stale` };
  }
}

function anchorState(thread: ArtifactReview, headVersion: number): string {
  if (thread.artifact_version === headVersion) return '';
  if (thread.anchor.profile === 'region')
    return t`Made on version ${ph({ artifact_version: thread.artifact_version })}; shown beside the newest`;
  if (thread.anchor_state === 'moved') return t`Moved to version ${headVersion}`;
  if (thread.anchor_state === 'outdated' && thread.anchor_error)
    return t`Outdated: version ${ph({ artifact_version: thread.artifact_version })} is no longer available`;
  if (thread.anchor_state === 'outdated')
    return t`Outdated: version ${headVersion} changed this part`;
  return t`Made on version ${ph({ artifact_version: thread.artifact_version })}`;
}

function Crop({
  threadId,
  side,
  label,
}: {
  threadId: string;
  side: 'before' | 'after';
  label: string;
}) {
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
  if (crop.isError) return <p className="text-xs text-muted-foreground">{t`${label}: no crop`}</p>;
  return (
    <figure className="min-w-0 flex-1">
      {url ? (
        <img alt={label} className="max-h-40 w-full rounded border object-contain" src={url} />
      ) : null}
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/** One send's threads: the agent answers a send in one turn, so its reply shows once. */
interface ThreadGroup {
  key: string;
  threads: ArtifactReview[];
  reply?: ArtifactReview;
}

function groupBySend(rows: readonly ArtifactReview[]): ThreadGroup[] {
  const groups = new Map<string, ThreadGroup>();
  for (const thread of rows) {
    const key =
      thread.reply_message_id || thread.session_key || thread.message_id || `thread:${thread.id}`;
    const group = groups.get(key) ?? { key, threads: [] };
    group.threads.push(thread);
    if (!group.reply && (thread.reply_text || thread.reply_version_artifact_id))
      group.reply = thread;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * The thread list beside a document (comments plan, "Threads in the document"): each mark's
 * label, where it points, the comment, the agent's reply and the version it made, its
 * re-anchoring state, and for a region on an older version, before and after. Given the
 * version on screen it lists that version's threads, with the others one step away.
 */
export function CommentThreadList({
  artifactId,
  sessionId,
  version,
}: {
  artifactId: string;
  sessionId: string;
  /** The version on screen; threads on other versions wait behind a button. */
  version?: number;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [showOthers, setShowOthers] = useState(false);
  const threads = useQuery({
    queryKey: commentThreadsKey(settings.endpoint, artifactId),
    queryFn: ({ signal }) => repository.commentThreads(artifactId, sessionId, signal),
    refetchInterval: (query) =>
      query.state.data?.threads.some((row) => row.status === 'dispatched' && !row.reply_text)
        ? 3_000
        : false,
  });
  if (threads.isPending)
    return <p className="p-3 text-sm text-muted-foreground">{t`Loading comments…`}</p>;
  if (threads.isError)
    return (
      <p className="p-3 text-sm text-destructive" role="alert">
        {threads.error.message}
      </p>
    );
  const head = threads.data.head;
  const sent = threads.data.threads.filter((row) => row.status !== 'draft');
  const onScreen = version ? sent.filter((row) => row.artifact_version === version) : sent;
  const others = sent.length - onScreen.length;
  const rows = showOthers ? sent : onScreen;
  if (!sent.length)
    return (
      <p className="p-3 text-sm text-muted-foreground">
        {t`No comments yet. Use Comment to mark text, a region or an element and tell the agent what to change.`}
      </p>
    );
  // Threads on other versions exist only when a version is on screen.
  const otherVersions =
    others && version ? (
      <Button
        className="w-full justify-start text-muted-foreground"
        onClick={() => setShowOthers((shown) => !shown)}
        size="sm"
        variant="ghost"
      >
        {showOthers
          ? t`Only version ${version}`
          : plural(others, {
              one: '# comment on other versions',
              other: '# comments on other versions',
            })}
      </Button>
    ) : null;
  return (
    <div className="space-y-2 p-3">
      {rows.length || !version ? null : (
        <p className="text-sm text-muted-foreground">{t`No comments on version ${version}.`}</p>
      )}
      <ol aria-label={t`Comment threads`} className="space-y-3" data-slot="comment-thread-list">
        {groupBySend(rows).map((group) => (
          <li
            className="space-y-2 rounded-md border p-3 text-sm"
            data-slot="comment-thread-group"
            key={group.key}
          >
            <ol className="space-y-3">
              {group.threads.map((thread) => (
                <ThreadRow head={head.version} key={thread.id} thread={thread} />
              ))}
            </ol>
            {group.reply?.reply_text ? <Reply text={group.reply.reply_text} /> : null}
            {group.reply?.reply_version_artifact_id ? (
              <p className="text-xs">{t`The agent made a new version.`}</p>
            ) : null}
          </li>
        ))}
      </ol>
      {otherVersions}
    </div>
  );
}

/** The agent's answer to one send: a few lines, the rest one press away. */
function Reply({ text }: { text: string }) {
  const [whole, setWhole] = useState(false);
  const long = text.length > 240 || text.split('\n').length > 4;
  return (
    <div>
      <blockquote
        className={cn(
          'border-l-2 pl-2 text-muted-foreground',
          long &&
            !whole &&
            'max-h-24 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]',
        )}
        data-slot="comment-reply"
      >
        <MessageResponse className="text-sm leading-6">{text}</MessageResponse>
      </blockquote>
      {long ? (
        <Button
          className="h-7 px-2 text-xs"
          onClick={() => setWhole((shown) => !shown)}
          size="sm"
          variant="ghost"
        >
          {whole ? t`Show less` : t`Show the whole reply`}
        </Button>
      ) : null}
    </div>
  );
}

function ThreadRow({ thread, head }: { thread: ArtifactReview; head: number }) {
  const status = threadStatus(thread);
  const state = anchorState(thread, head);
  const older = thread.artifact_version !== head;
  return (
    <li data-thread-label={thread.label}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
          {thread.label || '•'}
        </span>
        <ClioStatus
          compact
          detail={thread.reply_error || thread.error}
          label={status.label}
          value={status.value}
        />
        <span className="text-xs text-muted-foreground">{t`Version ${ph({ artifact_version: thread.artifact_version })}`}</span>
      </div>
      <p className="truncate text-xs text-muted-foreground" title={anchorPreview(thread.anchor)}>
        {anchorPreview(thread.anchor)}
      </p>
      <p className="mt-1 whitespace-pre-wrap">{thread.text || t`(no comment)`}</p>
      {state ? <p className="mt-1 text-xs text-muted-foreground">{state}</p> : null}
      {older && (thread.anchor.profile === 'region' || thread.anchor.profile === 'dom') ? (
        <div className="mt-2 flex gap-2" data-slot="comment-compare">
          <Crop
            label={t`Before, version ${ph({ artifact_version: thread.artifact_version })}`}
            side="before"
            threadId={thread.id}
          />
          <Crop label={t`After, version ${head}`} side="after" threadId={thread.id} />
        </div>
      ) : null}
    </li>
  );
}
