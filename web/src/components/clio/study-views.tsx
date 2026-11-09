import { a2uiSurfaceSchema, type ScienceStudy, type ScienceView } from '@clio/core/v3';
import { useMemo, useState } from 'react';
import { useStudyViewFocus } from '@/lib/a2ui/open-view';
import { useA2uiSessionRegistry } from '@/lib/a2ui/processor-store';
import { ClioA2UISurface } from './a2ui-surface';
import { StateView } from './primitives/state-view';
import { branchTitle, studyViewDomId } from './science-log-model';

/**
 * One of the study's views: the dashboard a conversation attached with a `view`
 * entry, opened from the study list or by a surface's `openView`. Each is its
 * owner's own surface, so its actions go to the conversation that made it.
 */
export function StudyViews({
  study,
  readOnly = false,
}: {
  study: ScienceStudy;
  readOnly?: boolean;
}) {
  const titles = useMemo(
    () => new Map(study.branches.map((branch) => [branch.session_id, branchTitle(branch)])),
    [study],
  );
  // Each owner's catalogs resolve its surface, whichever session this tab belongs to.
  useA2uiSessionRegistry(study.views.map((view) => view.session_id));
  // One view at a time: the last one asked for, else the study's first.
  const [chosen, setChosen] = useState<string>();
  const requested = useStudyViewFocus((state) => state.entry);
  const request = useStudyViewFocus((state) => state.nonce);
  const [answered, setAnswered] = useState<number>();
  if (requested && request !== answered && study.views.some((view) => view.entry === requested)) {
    setAnswered(request);
    setChosen(requested);
  }
  const shown = study.views.find((view) => view.entry === chosen) ?? study.views[0];
  if (!shown) return null;
  const owner =
    shown.session_id === study.root_session_id
      ? 'the study'
      : titles.get(shown.session_id) || shown.session_id;
  return <StudyViewPanel key={shown.entry} owner={owner} readOnly={readOnly} view={shown} />;
}

function StudyViewPanel({
  view,
  owner,
  readOnly,
}: {
  view: ScienceView;
  owner: string;
  readOnly: boolean;
}) {
  const parsed = useMemo(
    () => (view.surface ? a2uiSurfaceSchema.safeParse(view.surface) : undefined),
    [view.surface],
  );
  return (
    <section
      aria-label={view.title || 'Study view'}
      className="min-w-0 scroll-mt-3 space-y-3"
      data-slot="study-view"
      id={studyViewDomId(view.entry)}
    >
      <header className="space-y-0.5">
        <h3 className="text-[13px] font-semibold">{view.title || 'Untitled view'}</h3>
        {view.purpose ? <p className="text-xs text-muted-foreground">{view.purpose}</p> : null}
        <p className="text-xs text-muted-foreground">Attached by {owner}</p>
        {view.read_only ? (
          <p className="text-xs text-muted-foreground">
            Attached as a conversation view before study views were dashboards; shown as it is.
          </p>
        ) : null}
      </header>
      {!view.surface ? (
        <StateView
          kind="unavailable"
          title="The conversation that attached this view has since deleted its dashboard."
        />
      ) : parsed?.success ? (
        <div className="overflow-x-auto">
          <ClioA2UISurface readOnly={readOnly || view.read_only} surface={parsed.data} />
        </div>
      ) : (
        <StateView kind="error" title="This view's dashboard could not be read." />
      )}
    </section>
  );
}
