import {
  TransportError,
  type CommentAttachment,
  type CommentMode,
  type CommentTarget,
  type DocumentAnchor,
} from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
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
  type MarkPlace,
} from './comment-model';
import { CommentControls } from './comment-controls';
import { CommentEditor } from './comment-editor';
import { onCommentThreadReveal, takeCommentThreadReveal } from './comment-thread-reveal';
import { plural, t, ph } from '@lingui/core/macro';

const HINTS: Record<CommentMode, string> = {
  text: t`Select text to mark it.`,
  region: t`Drag over the view to mark a region.`,
  element: t`Click an element to pick it.`,
};

export interface CommentSessionValue {
  surface: CommentSurface;
  /** The comment controls are shown. */
  open: boolean;
  /** Select is on: the next selection, drag or pick becomes a mark. */
  active: boolean;
  mode: CommentMode;
  setMode: (mode: CommentMode) => void;
  marks: readonly DraftMark[];
  /** Sent threads and notes on this surface (drafts are counted as marks). */
  threadCount: number;
  /** The surface's thread list is showing. */
  threadsOpen: boolean;
  setThreadsOpen: (open: boolean) => void;
  editing?: string;
  setEditing: (label?: string) => void;
  start: () => void;
  stop: () => void;
  toggleSelect: () => void;
  addMark: (anchor: DocumentAnchor, place?: MarkPlace) => string;
  updateMark: (label: string, patch: Partial<DraftMark>) => void;
  removeMark: (label: string) => void;
  send: (options?: { history?: boolean }) => Promise<void>;
  sending: boolean;
  error?: string;
  /** The file has a newer version than the one the marks are on; set by a refused send. */
  stale?: StaleVersion;
  /** Move the marks to the newest version, so they are sent there. */
  markAgain: () => Promise<void>;
}

/** A send the server refused because the marked version is no longer the newest. */
export interface StaleVersion {
  marked: number;
  newest: number;
}

/** The newest version a refused send names, when the refusal is about the version. */
function staleVersion(cause: unknown, marked: number): StaleVersion | undefined {
  if (!(cause instanceof TransportError) || cause.status !== 409) return undefined;
  if (cause.code !== 'stale_artifact_anchor') return undefined;
  const details = (cause.details ?? {}) as { head_version?: unknown; actual_version?: unknown };
  const newest = Number(details.head_version ?? details.actual_version);
  return Number.isInteger(newest) && newest > 0 ? { marked, newest } : undefined;
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
  threadList,
  onOpenVersion,
}: {
  surface: CommentSurface;
  children: ReactNode;
  /** Open the panel at once (a file registered by the person's first click on Comment). */
  initiallyActive?: boolean;
  prepareImages?: (marks: readonly DraftMark[]) => Promise<CommentAttachment['images']>;
  onSent?: () => void;
  /** The surface's earlier threads, reachable from the open controls. */
  threadList?: ReactNode;
  /**
   * The surface shows one fixed version. Marking again opens the newest version, with the
   * marks kept as its draft; without this the surface shows the file as it is now, and the
   * marks move to the newest version in place.
   */
  onOpenVersion?: (target: CommentTarget) => void;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  // After "Mark again", the marks go to the newest version until the surface shows it.
  const [retarget, setRetarget] = useState<CommentTarget>();
  const shown = surface.destination;
  const destination = useMemo(
    () =>
      retarget && shown.kind === 'artifact' && retarget.version > shown.version
        ? {
            ...shown,
            artifactId: retarget.artifact_id,
            version: retarget.version,
            sha256: retarget.sha256,
          }
        : shown,
    [retarget, shown],
  );
  const [open, setOpen] = useState(initiallyActive);
  const [active, setActive] = useState(initiallyActive);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [mode, setMode] = useState<CommentMode>(surface.defaultMode);
  const [marks, setMarks] = useState<DraftMark[]>([]);
  const [editing, setEditing] = useState<string>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [stale, setStale] = useState<StaleVersion>();
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
            preview: anchorPreview(row.anchor),
          })),
    );
  }, [threads.data, destination]);

  const floor = labelNumber(threads.data?.next_label) || 1;
  const addMark = useCallback(
    (anchor: DocumentAnchor, place: MarkPlace = {}) => {
      // The label is chosen here, not in the state update, so the new mark's editor opens.
      const label = nextLabel(
        marks.map((mark) => mark.label),
        floor,
      );
      const mark: DraftMark = {
        label,
        mode: anchorMode(anchor),
        anchor,
        comment: '',
        preview: place.preview ?? anchorPreview(anchor),
        box: place.box,
        view: place.view,
        viewer: place.viewer,
      };
      setMarks((current) =>
        current.some((existing) => existing.label === label) ? current : [...current, mark],
      );
      setEditing(label);
      return label;
    },
    [floor, marks],
  );
  const updateMark = useCallback((label: string, patch: Partial<DraftMark>) => {
    setMarks((current) =>
      current.map((mark) => (mark.label === label ? { ...mark, ...patch } : mark)),
    );
  }, []);
  const removeMark = useCallback((label: string) => {
    setMarks((current) => current.filter((mark) => mark.label !== label));
  }, []);

  const saveDrafts = useCallback(
    async (rows: readonly DraftMark[], target?: CommentTarget) => {
      if (destination.kind !== 'artifact') return;
      const artifact = target?.artifact_id ?? destination.artifactId;
      await repository.saveCommentDrafts(artifact, {
        session_id: destination.sessionId,
        expected_version: target?.version ?? destination.version,
        expected_sha256: target?.sha256 ?? destination.sha256,
        marks: rows.map((mark) => ({
          label: mark.label,
          anchor: mark.anchor,
          comment: mark.comment,
          send_to_agent: true,
        })),
      });
      await queryClient.invalidateQueries({
        queryKey: commentThreadsKey(settings.endpoint, artifact),
      });
    },
    [destination, queryClient, repository, settings.endpoint],
  );

  const stop = useCallback(() => {
    setOpen(false);
    setActive(false);
    setThreadsOpen(false);
    setEditing(undefined);
    if (destination.kind === 'artifact') {
      void saveDrafts(marks).catch((cause: unknown) =>
        toast.error(t`Could not keep the draft comments`, {
          description: cause instanceof Error ? cause.message : String(cause),
        }),
      );
    } else {
      setMarks([]);
    }
  }, [destination.kind, marks, saveDrafts]);

  const send = useCallback(
    async ({ history = false }: { history?: boolean } = {}) => {
      if (!marks.length || sending) return;
      setSending(true);
      setError(undefined);
      setStale(undefined);
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
              send_to_agent: true,
            })),
            ...(history ? { allow_historical: true } : {}),
          });
          const failed = sent.threads.find((row) => row.status === 'failed');
          if (failed) throw new Error(failed.error || t`The comments could not be sent.`);
          await queryClient.invalidateQueries({
            queryKey: commentThreadsKey(settings.endpoint, artifactId),
          });
          toast.success(
            plural(marks.length, {
              one: '# comment sent to the agent.',
              other: '# comments sent to the agent.',
            }),
          );
        } else {
          attachCommentSession({
            kind: destination.surface,
            title: surface.title,
            marks: marks.map((mark) => ({
              label: mark.label,
              anchor: mark.anchor,
              comment: mark.comment,
            })),
            images: prepareImages ? await prepareImages(marks) : undefined,
          });
        }
        setMarks([]);
        setOpen(false);
        setActive(false);
        setEditing(undefined);
        onSent?.();
      } catch (cause) {
        const newer =
          destination.kind === 'artifact' ? staleVersion(cause, destination.version) : undefined;
        if (newer) setStale(newer);
        else setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSending(false);
      }
    },
    [
      artifactId,
      destination,
      marks,
      onSent,
      prepareImages,
      queryClient,
      repository,
      sending,
      settings.endpoint,
      surface.title,
    ],
  );

  const markAgain = useCallback(async () => {
    if (destination.kind !== 'artifact' || sending) return;
    setSending(true);
    setError(undefined);
    try {
      const { head } = await repository.commentThreads(
        destination.artifactId,
        destination.sessionId,
      );
      // The workspace file's own target is out of date too; its viewer reads it again.
      await queryClient.invalidateQueries({
        queryKey: queryKeys.key('comment-threads', settings.endpoint, 'target'),
      });
      setStale(undefined);
      if (onOpenVersion) {
        // This surface shows the marked version; the marks wait as the newest one's draft.
        await saveDrafts(marks, head);
        setMarks([]);
        setOpen(false);
        setActive(false);
        setEditing(undefined);
        onOpenVersion(head);
        return;
      }
      setRetarget(head);
      setActive(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }, [
    destination,
    marks,
    onOpenVersion,
    queryClient,
    repository,
    saveDrafts,
    sending,
    settings.endpoint,
  ]);

  const threadCount = threads.data?.threads.filter((row) => row.status !== 'draft').length ?? 0;
  // A transcript chip asked for these threads: show the controls and the thread list.
  const threadIds = threads.data?.threads;
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    if (!threadIds?.length) return undefined;
    const ids = threadIds.map((row) => row.id);
    const reveal = (since?: number) => {
      if (!takeCommentThreadReveal(ids, since)) return;
      setOpen(true);
      setThreadsOpen(true);
    };
    reveal(mountedAt);
    return onCommentThreadReveal(() => reveal());
  }, [mountedAt, threadIds]);
  const value = useMemo<CommentSessionValue>(
    () => ({
      surface,
      open,
      active,
      mode,
      setMode,
      marks,
      threadCount,
      threadsOpen,
      setThreadsOpen,
      editing,
      setEditing,
      start: () => {
        restoreDrafts();
        setOpen(true);
        setActive(true);
      },
      stop,
      toggleSelect: () => setActive((selecting) => !selecting),
      addMark,
      updateMark,
      removeMark,
      send,
      sending,
      error,
      stale,
      markAgain,
    }),
    [
      surface,
      open,
      active,
      mode,
      marks,
      threadCount,
      threadsOpen,
      editing,
      stop,
      addMark,
      updateMark,
      removeMark,
      send,
      sending,
      error,
      stale,
      markAgain,
      restoreDrafts,
    ],
  );
  return (
    <CommentSessionContext.Provider value={value}>
      {children}
      {open ? <CommentSessionControls session={value} threadList={threadList} /> : null}
    </CommentSessionContext.Provider>
  );
}

/**
 * Where the comment controls are portalled. Inside a modal sheet or dialog (the pocket
 * at phone width) they must sit within its content, or its focus trap pulls focus back
 * out of the comment editor and nothing typed lands.
 */
const MODAL_CONTENT = '[data-slot="sheet-content"], [data-slot="dialog-content"]';

const CommentRegion = createContext<HTMLElement | null>(null);

/** The workbench pocket the commented surface sits in, which the controls' cards stay within. */
// oxlint-disable-next-line react/only-export-components
export function useCommentRegion(): HTMLElement | null {
  return useContext(CommentRegion);
}

/** The shared comment controls and, for the mark being edited, its editor. */
function CommentSessionControls({
  session,
  threadList,
}: {
  session: CommentSessionValue;
  threadList?: ReactNode;
}) {
  const [place, setPlace] = useState<{ host: HTMLElement; region: HTMLElement | null }>();
  const probe = useCallback((node: HTMLSpanElement | null) => {
    if (!node) return;
    setPlace({
      host: node.closest<HTMLElement>(MODAL_CONTENT) ?? document.body,
      region: node.closest<HTMLElement>('[data-workbench-pocket]'),
    });
  }, []);
  return (
    <>
      <span data-slot="comment-controls-probe" hidden ref={probe} />
      {place
        ? createPortal(
            <CommentRegion.Provider value={place.region}>
              <CommentSessionControlsBody session={session} threadList={threadList} />
            </CommentRegion.Provider>,
            place.host,
          )
        : null}
    </>
  );
}

function CommentSessionControlsBody({
  session,
  threadList,
}: {
  session: CommentSessionValue;
  threadList?: ReactNode;
}) {
  const { surface, marks } = session;
  const artifact = surface.destination.kind === 'artifact';
  const count = marks.length;
  const editing = marks.find((mark) => mark.label === session.editing);
  const rect = editing?.anchor.profile === 'region' ? editing.anchor.rect : undefined;
  return (
    <>
      <CommentControls
        busy={session.sending}
        busyLabel={t`Sending…`}
        conflict={
          session.stale
            ? {
                message: t`Marked on version ${ph({ marked: session.stale.marked })}. The file is on version ${ph({ newest: session.stale.newest })}.`,
                actions: [
                  {
                    label: t`Mark again on the new version`,
                    onClick: () => void session.markAgain(),
                  },
                  {
                    label: t`Send as history`,
                    onClick: () => void session.send({ history: true }),
                  },
                ],
              }
            : undefined
        }
        error={session.error}
        hint={HINTS[session.mode]}
        marks={marks}
        mode={session.mode}
        modes={surface.modes}
        onClose={session.stop}
        onMode={session.setMode}
        onOpenMark={session.setEditing}
        onSend={() => void session.send()}
        onToggleSelect={session.toggleSelect}
        selecting={session.active}
        sendDisabled={Boolean(session.editing)}
        sendLabel={
          artifact
            ? plural(count, { one: 'Send # comment', other: 'Send # comments' })
            : plural(count, { one: 'Add # mark to message', other: 'Add # marks to message' })
        }
        title={surface.title}
      >
        {threadList}
      </CommentControls>
      {editing ? (
        <CommentEditor
          comment={editing.comment}
          coordinates={
            rect?.length === 4
              ? {
                  box: { x: rect[0], y: rect[1], width: rect[2], height: rect[3] },
                  onChange: (box) =>
                    session.updateMark(editing.label, {
                      anchor: { ...editing.anchor, rect: [box.x, box.y, box.width, box.height] },
                    }),
                }
              : undefined
          }
          detail={
            rect
              ? editing.note
              : [editing.preview, editing.note].filter(Boolean).join(' — ') || undefined
          }
          key={editing.label}
          label={editing.label}
          near={editing.box}
          onCancel={() => session.setEditing(undefined)}
          onDelete={() => {
            session.removeMark(editing.label);
            session.setEditing(undefined);
          }}
          onDone={(comment) => {
            session.updateMark(editing.label, { comment });
            session.setEditing(undefined);
          }}
          // A mark on one of a project's source files (a paper's section) names that file.
          title={editing.anchor.source_path || surface.title}
        />
      ) : null}
    </>
  );
}
