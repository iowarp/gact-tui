import type { CommentAttachment, CommentMode, DocumentAnchor } from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  anchorMode,
  anchorPreview,
  attachCommentSession,
  labelNumber,
  nextLabel,
  type CommentSurface,
  type DraftMark,
} from './comment-model';
import { CommentPanel } from './comment-panel';

export interface CommentSessionValue {
  surface: CommentSurface;
  active: boolean;
  mode: CommentMode;
  setMode: (mode: CommentMode) => void;
  marks: readonly DraftMark[];
  editing?: string;
  setEditing: (label?: string) => void;
  start: () => void;
  stop: () => void;
  addMark: (anchor: DocumentAnchor, preview?: string) => string;
  updateMark: (label: string, patch: Partial<DraftMark>) => void;
  removeMark: (label: string) => void;
  send: () => Promise<void>;
  sending: boolean;
  error?: string;
}

const CommentSessionContext = createContext<CommentSessionValue | undefined>(undefined);

/** The comment session of the surface this component is inside, if any. */
// oxlint-disable-next-line react/only-export-components
export function useCommentSession(): CommentSessionValue | undefined {
  return useContext(CommentSessionContext);
}

/** The query key of an artifact's threads, shared by the thread list and the layer. */
// oxlint-disable-next-line react/only-export-components
export function commentThreadsKey(endpoint: string, artifactId: string) {
  return queryKeys.key('comment-threads', endpoint, artifactId);
}

/**
 * One select session on one surface: the marks, their labels and comments, the mode the
 * next mark uses, and the panel that lists and sends them. An artifact's unsent marks are
 * kept as a draft on its version when the panel closes; anything else discards them
 * (addendum A, section 1). Images an attachment needs (an A2UI surface's overview and
 * crops) come from `prepareImages` at send time.
 */
export function CommentSessionProvider({
  surface,
  children,
  prepareImages,
  onSent,
  initiallyActive = false,
}: {
  surface: CommentSurface;
  children: ReactNode;
  /** Open the panel at once (a file registered by the person's first click on Comment). */
  initiallyActive?: boolean;
  prepareImages?: (marks: readonly DraftMark[]) => Promise<CommentAttachment['images']>;
  onSent?: () => void;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const destination = surface.destination;
  const [active, setActive] = useState(initiallyActive);
  const [mode, setMode] = useState<CommentMode>(surface.defaultMode);
  const [marks, setMarks] = useState<DraftMark[]>([]);
  const [editing, setEditing] = useState<string>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const loadedDrafts = useRef(false);
  const artifactId = destination.kind === 'artifact' ? destination.artifactId : '';
  const sessionId = destination.kind === 'artifact' ? destination.sessionId : '';
  const threads = useQuery({
    queryKey: commentThreadsKey(settings.endpoint, artifactId),
    queryFn: ({ signal }) => repository.commentThreads(artifactId, sessionId, signal),
    enabled: Boolean(artifactId),
  });

  /** This session's drafts on the version, restored when the person opens the panel. */
  const restoreDrafts = useCallback(() => {
    if (loadedDrafts.current || !threads.data || destination.kind !== 'artifact') return;
    loadedDrafts.current = true;
    const drafts = threads.data.threads.filter(
      (row) =>
        row.status === 'draft' &&
        row.session_id === destination.sessionId &&
        row.artifact_id === destination.artifactId,
    );
    if (!drafts.length) return;
    setMarks((current) =>
      current.length
        ? current
        : drafts.map((row) => ({
            label: row.label || nextLabel([]),
            mode: anchorMode(row.anchor),
            anchor: row.anchor,
            comment: row.text,
            sendToAgent: row.send_to_agent ?? true,
            preview: anchorPreview(row.anchor),
          })),
    );
  }, [threads.data, destination]);

  const floor = labelNumber(threads.data?.next_label) || 1;
  const addMark = useCallback(
    (anchor: DocumentAnchor, preview?: string) => {
      let label = '';
      setMarks((current) => {
        label = nextLabel(
          current.map((mark) => mark.label),
          floor,
        );
        return [
          ...current,
          {
            label,
            mode: anchorMode(anchor),
            anchor,
            comment: '',
            sendToAgent: true,
            preview: preview ?? anchorPreview(anchor),
          },
        ];
      });
      setEditing(label);
      return label;
    },
    [floor],
  );
  const updateMark = useCallback((label: string, patch: Partial<DraftMark>) => {
    setMarks((current) => current.map((mark) => (mark.label === label ? { ...mark, ...patch } : mark)));
  }, []);
  const removeMark = useCallback((label: string) => {
    setMarks((current) => current.filter((mark) => mark.label !== label));
  }, []);

  const saveDrafts = useCallback(
    async (rows: readonly DraftMark[]) => {
      if (destination.kind !== 'artifact') return;
      await repository.saveCommentDrafts(destination.artifactId, {
        session_id: destination.sessionId,
        expected_version: destination.version,
        expected_sha256: destination.sha256,
        marks: rows.map((mark) => ({
          label: mark.label,
          anchor: mark.anchor,
          comment: mark.comment,
          send_to_agent: mark.sendToAgent,
        })),
      });
      await queryClient.invalidateQueries({ queryKey: commentThreadsKey(settings.endpoint, artifactId) });
    },
    [artifactId, destination, queryClient, repository, settings.endpoint],
  );

  const stop = useCallback(() => {
    setActive(false);
    setEditing(undefined);
    if (destination.kind === 'artifact') {
      void saveDrafts(marks).catch((cause: unknown) =>
        toast.error('Could not keep the draft comments', {
          description: cause instanceof Error ? cause.message : String(cause),
        }),
      );
    } else {
      setMarks([]);
    }
  }, [destination.kind, marks, saveDrafts]);

  const send = useCallback(async () => {
    if (!marks.length || sending) return;
    setSending(true);
    setError(undefined);
    try {
      if (destination.kind === 'artifact') {
        const sent = await repository.sendCommentSession(destination.sessionId, {
          artifact_id: destination.artifactId,
          expected_version: destination.version,
          expected_sha256: destination.sha256,
          idempotency_key: `comments-${nanoid(16)}`,
          marks: marks.map((mark) => ({
            label: mark.label,
            anchor: mark.anchor,
            comment: mark.comment,
            send_to_agent: mark.sendToAgent,
          })),
        });
        const failed = sent.threads.find((row) => row.status === 'failed');
        if (failed) throw new Error(failed.error || 'The comments could not be sent.');
        await queryClient.invalidateQueries({ queryKey: commentThreadsKey(settings.endpoint, artifactId) });
        toast.success(
          sent.message_id
            ? `${marks.length} ${marks.length === 1 ? 'comment' : 'comments'} sent to the agent.`
            : `${marks.length} ${marks.length === 1 ? 'note' : 'notes'} kept.`,
        );
      } else {
        attachCommentSession({
          kind: destination.surface,
          title: surface.title,
          marks: marks.map((mark) => ({ label: mark.label, anchor: mark.anchor, comment: mark.comment })),
          images: prepareImages ? await prepareImages(marks) : undefined,
        });
      }
      setMarks([]);
      setActive(false);
      setEditing(undefined);
      onSent?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }, [artifactId, destination, marks, onSent, prepareImages, queryClient, repository, sending, settings.endpoint, surface.title]);

  const value = useMemo<CommentSessionValue>(
    () => ({
      surface,
      active,
      mode,
      setMode,
      marks,
      editing,
      setEditing,
      start: () => {
        restoreDrafts();
        setActive(true);
      },
      stop,
      addMark,
      updateMark,
      removeMark,
      send,
      sending,
      error,
    }),
    [
      surface,
      active,
      mode,
      marks,
      editing,
      stop,
      addMark,
      updateMark,
      removeMark,
      send,
      sending,
      error,
      restoreDrafts,
    ],
  );
  return (
    <CommentSessionContext.Provider value={value}>
      {children}
      {active ? <CommentPanel session={value} /> : null}
    </CommentSessionContext.Provider>
  );
}
