import { ClioRepository } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChartLineIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { ClioConversation } from '@/components/clio/conversation';
import { ADD_COMMENT_SESSION_EVENT } from '@/components/clio/comments/comment-model';
import { shareA2uiCatalogRows } from '@/lib/a2ui/shared-catalog-rows';
import {
  disposeA2uiSessionRegistry,
  loadA2uiSessionCatalogs,
  markA2uiSessionRouteUnavailable,
} from '@/lib/a2ui/registry-store';
import { vocab } from '@/lib/brand-vocabulary';
import { createGalleryRepository } from '@/lib/gallery-repository';
import { practiceConversation } from '@/lib/onboarding/tour-practice-data';
import { tourAnchor } from '@/lib/onboarding/tour-anchors';
import { TOUR_PRACTICE_SESSION_ID, TourTransport } from '@/lib/onboarding/tour-transport';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import {
  createSelectionActionRegistry,
  type DataSurfaceZoneSelection,
} from '@/lib/selection-actions';
import { RepositoryOverrideProvider } from '@/providers/repository-override';

/** Window events a practice surface could send to the real composer. */
const COMPOSER_EVENTS = [ADD_COMMENT_SESSION_EVENT, 'clio:use-message-draft'];

type Note =
  | { kind: 'artifact' }
  | { kind: 'capture' }
  | { kind: 'reference'; reference: DataSurfaceZoneSelection };

/**
 * The scripted practice conversation, drawn by the real transcript, artifact
 * and A2UI components over bundled sample data. It owns its own query cache,
 * repository, catalog registry and selection actions, so nothing reaches an
 * agent, the person's conversations, their draft or the app's caches, and
 * unmounting it leaves nothing behind.
 */
export function TourPracticeStage({
  stageId,
  stageRef,
}: {
  stageId: string;
  stageRef: Ref<HTMLDivElement>;
}) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const [repository] = useState(
    () => createGalleryRepository(new ClioRepository(new TourTransport())) as ClioRepository,
  );
  const selectionActions = useMemo(() => createSelectionActionRegistry(), []);
  const conversation = useMemo(() => practiceConversation(), []);
  const [note, setNote] = useState<Note>();
  const [noteStep, setNoteStep] = useState(stageId);
  // A note answers one step's try-it; moving on clears it.
  if (noteStep !== stageId) {
    setNoteStep(stageId);
    setNote(undefined);
  }
  const noteRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => client.clear(), [client]);

  useEffect(() => {
    const controller = new AbortController();
    repository
      .a2uiCatalogs(TOUR_PRACTICE_SESSION_ID, controller.signal)
      .then((result) => {
        const shared = shareA2uiCatalogRows(result);
        loadA2uiSessionCatalogs(TOUR_PRACTICE_SESSION_ID, shared.rows, shared.rejected, false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        markA2uiSessionRouteUnavailable(
          TOUR_PRACTICE_SESSION_ID,
          'a2ui_catalog_decode_failed',
          error instanceof Error ? error.message : 'The sample catalog did not load.',
        );
      });
    return () => {
      controller.abort();
      disposeA2uiSessionRegistry(TOUR_PRACTICE_SESSION_ID);
    };
  }, [repository]);

  useEffect(
    () =>
      selectionActions.register({
        id: 'tour-reference',
        label: 'Reference this',
        icon: ChartLineIcon,
        order: 10,
        kinds: ['data-surface-zone'],
        run: (target) => {
          if (target.kind === 'data-surface-zone')
            setNote({ kind: 'reference', reference: target });
        },
      }),
    [selectionActions],
  );

  useEffect(() => {
    // Capture phase on window runs before the composer's own listener.
    const intercept = (event: Event) => {
      event.stopImmediatePropagation();
      if (event.type === ADD_COMMENT_SESSION_EVENT) setNote({ kind: 'capture' });
    };
    for (const name of COMPOSER_EVENTS) window.addEventListener(name, intercept, true);
    return () => {
      for (const name of COMPOSER_EVENTS) window.removeEventListener(name, intercept, true);
    };
  }, []);

  useEffect(() => {
    if (note) noteRef.current?.scrollIntoView({ block: 'nearest' });
  }, [note]);

  return (
    <QueryClientProvider client={client}>
      <RepositoryOverrideProvider repository={repository}>
        <SelectionActionsContext.Provider value={selectionActions}>
          <section
            aria-label="Practice conversation"
            className="pointer-events-auto fixed inset-x-3 top-[5dvh] bottom-[5dvh] z-40 mx-auto flex max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            data-selection-actions="local"
            ref={stageRef}
            {...tourAnchor('practice-conversation')}
          >
            <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-medium">Practice conversation</h2>
              <p className="text-xs text-muted-foreground">Scripted. Nothing is sent or saved.</p>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              <ClioConversation
                {...conversation}
                agentName={vocab.agent}
                onOpenArtifact={() => setNote({ kind: 'artifact' })}
              />
              <div aria-live="polite" ref={noteRef}>
                {note ? <PracticeNote note={note} onDismiss={() => setNote(undefined)} /> : null}
              </div>
            </div>
          </section>
        </SelectionActionsContext.Provider>
      </RepositoryOverrideProvider>
    </QueryClientProvider>
  );
}

function PracticeNote({ note, onDismiss }: { note: Note; onDismiss: () => void }) {
  const title =
    note.kind === 'reference'
      ? `What ${vocab.agent} would receive`
      : note.kind === 'capture'
        ? 'Region captured'
        : 'Opening a file';
  return (
    <aside
      className="mx-4 mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm"
      data-tour-note=""
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium">{title}</h3>
        <button
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={onDismiss}
          type="button"
        >
          Dismiss
        </button>
      </div>
      {note.kind === 'reference' ? (
        <>
          <p className="mt-1 text-muted-foreground">
            {note.reference.title}: {note.reference.summary}. In a conversation this attaches to
            your next message.
          </p>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-background p-2 font-mono text-xs whitespace-pre-wrap">
            {note.reference.markdown}
          </pre>
        </>
      ) : (
        <p className="mt-1 text-muted-foreground">
          {note.kind === 'capture'
            ? 'In a conversation the marked region and your comments attach to your next message.'
            : 'In a conversation the file opens beside the chat, where you can read, download or export it.'}
        </p>
      )}
    </aside>
  );
}
