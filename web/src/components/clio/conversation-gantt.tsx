import { conversationHref, conversationRole } from './conversation-family-navigation';
import type { Artifact, ExecutionProvenanceResult, Session } from '@clio/core/v3';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ScanIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Gantt } from '@/components/reui/gantt/gantt';
import { GanttNav } from '@/components/reui/gantt/gantt-nav';
import { GanttView } from '@/components/reui/gantt/gantt-view';
import { conversationGantt, type ConversationGanttData } from './conversation-gantt-model';
import { ConversationFamilyLegend, ConversationRoleIcon } from './conversation-family-label';
import { executionZoom } from './observability-execution-model';
import { ConversationInspector } from './conversation-inspector';

/** Conversation-family Gantt with real turn durations and connected fork milestones. */
export function ConversationGantt({
  header,
  sessions,
  sessionId,
  provenance,
  pending,
  selectedId,
  onSelect,
  onOpenArtifact,
}: {
  header: ReactNode;
  sessions: readonly Session[];
  sessionId: string;
  provenance?: ExecutionProvenanceResult;
  pending?: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ width: 900, rem: 16 });
  const [now, setNow] = useState(Date.now);
  const [selected, setSelected] = useState<ConversationGanttData>();
  const model = useMemo(
    () => conversationGantt(sessions, sessionId, provenance, now),
    [sessions, sessionId, provenance, now],
  );
  const running = provenance?.spans.some(
    (span) => span.event_type === 'turn.started' && span.end_time === null,
  );
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setGeometry({
        width: element.clientWidth || 900,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const treeWidth = Math.min(350, Math.max(220, geometry.width * 0.28));
  const interval = model.extent.end - model.extent.start < 10 * 60000 ? 1 : 15;
  const initialZoom = executionZoom(
    model.extent,
    geometry.width - treeWidth,
    geometry.rem,
    interval,
  );
  const key = `${geometry.width}:${model.events.map((event) => event.id).join(':')}`;
  const [zoomState, setZoomState] = useState({ key, value: initialZoom });
  const zoom = zoomState.key === key ? zoomState.value : initialZoom;
  const center = new Date((model.extent.start + model.extent.end) / 2);
  const selectedSession =
    model.family.sessions.find((session) => session.id === (selectedId ?? sessionId)) ??
    model.family.sessions[0];
  return (
    <section
      aria-label="Conversation family Gantt"
      role="region"
      className="grid min-w-0 overflow-hidden @min-[48rem]:grid-cols-[minmax(0,1fr)_19rem]"
    >
      <div
        ref={container}
        className="min-w-0 overflow-hidden [&_[data-slot=gantt-bar-label]]:hidden"
      >
        {header}
        {model.events.length ? (
          <Gantt<ConversationGanttData>
            key={key}
            events={model.events}
            resources={model.resources}
            defaultDate={center}
            initialCenter={center}
            defaultScale="day"
            interval={interval}
            defaultInteractions={{ drag: false, resize: false, selectSlot: false }}
            baselineBars={false}
            dependencyLines
            summaryBars={false}
            rowCheckboxes={false}
            offDays={false}
            infiniteScroll={false}
            barLabel="inside"
            nowIndicator={Boolean(running)}
            scheduleMode="single"
            timelineLines="both"
            metrics={{
              laneHeight: 1.25,
              minRowHeight: 4,
              rowPadding: 0.8,
              unitWidths: { day: 2.5 },
            }}
            treePanel={{
              width: treeWidth,
              minWidth: 220,
              maxWidth: 440,
              nameColumnWidth: treeWidth,
            }}
            zoom={zoom}
            onZoomChange={(value) => setZoomState({ key, value })}
            zoomRange={{ min: 0.02, max: 256, step: Math.max(0.25, initialZoom / 8) }}
            wheelZoom
            style={{
              height: Math.min(600, Math.max(260, 110 + model.family.sessions.length * 64)),
            }}
            renderResourceLabel={({ resource }) => {
              const session = sessions.find((session) => session.id === resource.id);
              return session ? (
                <Link
                  to={conversationHref(session)}
                  onClick={(event) => event.stopPropagation()}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-primary hover:underline"
                  aria-label={`Open ${conversationRole(session).toLowerCase()}: ${session.title}`}
                >
                  <ConversationRoleIcon session={session} className="size-3.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-xs font-medium leading-4">
                      {session.title}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {conversationRole(session)}
                    </span>
                  </span>
                </Link>
              ) : (
                resource.title
              );
            }}
            renderEvent={({ occurrence }) =>
              occurrence.event.data?.kind === 'turn' ? (
                <span className="@container w-full">
                  <span className="hidden whitespace-nowrap text-[10px] font-medium @min-[5rem]:inline">
                    {Math.round((occurrence.end.getTime() - occurrence.start.getTime()) / 1000)}s
                    response
                  </span>
                </span>
              ) : null
            }
            onEventClick={(occurrence) => {
              setSelected(occurrence.event.data);
              if (occurrence.event.data) onSelect(occurrence.event.data.session.id);
            }}
            onResourceClick={({ resource }) => {
              const session = sessions.find((session) => session.id === resource.id);
              if (session) {
                setSelected({ session, kind: 'turn', status: session.state });
                onSelect(session.id);
              }
            }}
          >
            <GanttNav className="justify-end py-0.5">
              <span className="mr-auto text-xs tabular-nums text-muted-foreground">
                {new Date(model.extent.start).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
                –
                {new Date(model.extent.end).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Fit conversation family"
                onClick={() => setZoomState({ key, value: initialZoom })}
              >
                <ScanIcon />
                Fit
              </Button>
            </GanttNav>
            <GanttView />
          </Gantt>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            {pending
              ? 'Loading recorded family activity…'
              : 'No turn timings or saved branch points are available for this family.'}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <ConversationFamilyLegend />
          {selected ? (
            <>
              <strong className="text-foreground">{selected.session.title}</strong>
              <span>{selected.kind === 'fork' ? 'Fork created' : 'Agent response'}</span>
              <Link
                className="text-primary underline underline-offset-4"
                to={`/workspaces/${encodeURIComponent(selected.session.workspace_id)}/sessions/${encodeURIComponent(selected.session.id)}`}
              >
                Open conversation
              </Link>
            </>
          ) : (
            <>
              <span>Bars: responses</span>
              <span>◆ fork point</span>
            </>
          )}
          {provenance && (!provenance.complete || provenance.truncated) ? (
            <span role="status">Timing history is partial.</span>
          ) : null}
          {!provenance && !pending ? (
            <span role="status">
              Turn timings are unavailable; only saved branch points are shown.
            </span>
          ) : null}
        </div>
      </div>
      {selectedSession ? (
        <ConversationInspector
          session={selectedSession}
          sessions={model.family.sessions}
          onOpenArtifact={onOpenArtifact}
        />
      ) : null}
    </section>
  );
}
