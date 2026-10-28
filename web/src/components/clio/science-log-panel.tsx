import type { ScienceEntry } from '@clio/core/v3';
import { MessageSquareTextIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ENTRY_TYPE_LABELS,
  entryReference,
  entryState,
  entrySummary,
  measurements,
  outgoing,
  scienceEntryDomId,
  type EntryEdge,
} from './science-log-model';
import {
  AnalysisCall,
  ObservationSources,
  type ScienceCallLinks,
  type ScienceFileReference,
} from './science-log-sources';
import { ScienceStateChip } from './study-tree';

export interface ScienceLogPanelProps {
  /** The selected branch's entries, in the order they were written. */
  entries: readonly ScienceEntry[];
  branchTitle: string;
  /** Override the branch-log heading when showing a selected record in the graph inspector. */
  heading?: string;
  /** Hide the self-selection action when this panel already contains the selected record. */
  showSelection?: boolean;
  /** Every entry of the study, to name a link's target in another branch. */
  byId: ReadonlyMap<string, ScienceEntry>;
  /** Branch titles by session id. */
  titles: ReadonlyMap<string, string>;
  backlinks: ReadonlyMap<string, EntryEdge[]>;
  focusedEntry?: string;
  /** Jump to an entry, switching the selected branch when it is another branch's. */
  onSelectEntry: (entryId: string) => void;
  /** Scroll the transcript to the tool call that wrote the entry. */
  onViewInTranscript?: (entry: ScienceEntry) => void;
  /** Scroll the transcript to a call an entry cites (a source or an analysis). */
  onViewCall?: (sessionId: string, callId: string) => void;
  /** A link to a cited file, when this surface carries it. */
  fileHref?: (file: ScienceFileReference) => string | undefined;
}

/** One branch's log: its entries in order, each with its key field, status and links both ways. */
export function ScienceLogPanel({
  entries,
  branchTitle,
  heading,
  showSelection = true,
  byId,
  titles,
  backlinks,
  focusedEntry,
  onSelectEntry,
  onViewInTranscript,
  onViewCall,
  fileHref,
}: ScienceLogPanelProps) {
  const links: ScienceCallLinks = { onViewCall, fileHref, titles };
  return (
    <section aria-label={heading || `Log of ${branchTitle}`} className="grid min-w-0 gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">
        {heading || (
          <>
            Log of <span className="text-foreground">{branchTitle}</span>
            {` (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'})`}
          </>
        )}
      </h3>
      {entries.length ? (
        <ol className="grid min-w-0 gap-2">
          {entries.map((entry) => (
            <ScienceEntryCard
              backlinks={backlinks.get(entry.id) ?? []}
              byId={byId}
              entry={entry}
              focused={entry.id === focusedEntry}
              callLinks={links}
              key={entry.id}
              onSelectEntry={onSelectEntry}
              onViewInTranscript={onViewInTranscript}
              titles={titles}
              selectable={showSelection}
            />
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">This branch has written no entries yet.</p>
      )}
    </section>
  );
}

function ScienceEntryCard({
  entry,
  focused,
  byId,
  titles,
  backlinks,
  callLinks,
  onSelectEntry,
  onViewInTranscript,
  selectable,
}: {
  entry: ScienceEntry;
  focused: boolean;
  callLinks: ScienceCallLinks;
  byId: ReadonlyMap<string, ScienceEntry>;
  titles: ReadonlyMap<string, string>;
  backlinks: readonly EntryEdge[];
  onSelectEntry: (entryId: string) => void;
  onViewInTranscript?: (entry: ScienceEntry) => void;
  selectable: boolean;
}) {
  // A conclusion's citations are drawn on its claims; the list keeps its other links.
  const links = outgoing(entry).filter(
    (edge) => entry.type !== 'conclusion' || edge.relation !== 'cites',
  );
  const reference = (id: string) => {
    const target = byId.get(id);
    const elsewhere = target && target.branch !== entry.branch;
    return (
      <button
        className="min-w-0 text-left underline decoration-border underline-offset-2 hover:text-primary"
        onClick={() => onSelectEntry(id)}
        type="button"
      >
        {entryReference(target, id)}
        {elsewhere ? (
          <span className="text-muted-foreground">
            {` (in ${titles.get(target.branch) || target.branch})`}
          </span>
        ) : null}
      </button>
    );
  };
  return (
    <li
      aria-label={`${ENTRY_TYPE_LABELS[entry.type]}: ${entrySummary(entry) || entry.id}`}
      className={cn(
        'grid min-w-0 scroll-mt-2 gap-1.5 rounded-md border bg-card p-2 text-xs leading-5 outline-none',
        focused && 'border-primary ring-2 ring-primary/30',
      )}
      data-focused={focused || undefined}
      id={scienceEntryDomId(entry.id)}
      tabIndex={-1}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-medium">{ENTRY_TYPE_LABELS[entry.type]}</span>
        <ScienceStateChip state={entryState(entry)} />
        {entry.created_at ? (
          <time className="text-[11px] text-muted-foreground" dateTime={entry.created_at}>
            {formatTime(entry.created_at)}
          </time>
        ) : null}
        {selectable ? (
          <Button
            aria-label={`Select record: ${ENTRY_TYPE_LABELS[entry.type]}: ${entrySummary(entry) || entry.id}`}
            aria-pressed={focused}
            className="h-5 px-1.5 text-[11px]"
            onClick={() => onSelectEntry(entry.id)}
            size="xs"
            type="button"
            variant="ghost"
          >
            Inspect
          </Button>
        ) : null}
        {entry.invocation && onViewInTranscript ? (
          <Button
            className="ml-auto h-5 px-1.5 text-[11px]"
            onClick={() => onViewInTranscript(entry)}
            size="xs"
            type="button"
            variant="ghost"
          >
            <MessageSquareTextIcon aria-hidden="true" /> View in transcript
          </Button>
        ) : null}
      </div>
      <EntryBody entry={entry} links={callLinks} reference={reference} />
      {entry.status_reason ? (
        <p className="text-muted-foreground">Status reason: {entry.status_reason}</p>
      ) : null}
      {links.length ? (
        <EdgeList label="Links" rows={links.map((edge) => [edge.relation, reference(edge.to)])} />
      ) : null}
      {backlinks.length ? (
        <EdgeList
          label="Cited by"
          rows={backlinks.map((edge) => [edge.relation, reference(edge.from)])}
        />
      ) : null}
      {entry.type === 'observation' ? <ObservationSources entry={entry} links={callLinks} /> : null}
    </li>
  );
}

function EdgeList({ label, rows }: { label: string; rows: [string, ReactNode][] }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <ul className="grid min-w-0 gap-0.5">
        {rows.map(([relation, target], index) => (
          <li className="flex min-w-0 items-baseline gap-1.5" key={index}>
            <span className="shrink-0 text-muted-foreground">{relation.replaceAll('_', ' ')}</span>
            {target}
          </li>
        ))}
      </ul>
    </div>
  );
}

function field(entry: ScienceEntry, name: string): string {
  const value = entry.fields[name];
  if (value === undefined || value === null || value === '') return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function Fact({ label, value }: { label: string; value: string }) {
  return value ? (
    <p className="min-w-0 [overflow-wrap:anywhere]">
      <span className="text-muted-foreground">{label}: </span>
      {value}
    </p>
  ) : null;
}

/** The entry's key field by type: the statement, claim, method, measurements, interpretation or claims. */
function EntryBody({
  entry,
  links,
  reference,
}: {
  entry: ScienceEntry;
  links: ScienceCallLinks;
  reference: (id: string) => ReactNode;
}) {
  switch (entry.type) {
    case 'question':
      return (
        <>
          <p className="min-w-0 text-sm [overflow-wrap:anywhere]">{field(entry, 'statement')}</p>
          <Fact label="Scope" value={field(entry, 'scope')} />
          <Fact label="Budget" value={budget(entry.fields['budget'])} />
        </>
      );
    case 'hypothesis':
      return (
        <>
          <p className="min-w-0 text-sm [overflow-wrap:anywhere]">{field(entry, 'claim')}</p>
          <Fact label="Refuted if" value={field(entry, 'refuting_prediction')} />
          <Fact label="Formula" value={field(entry, 'formula')} />
        </>
      );
    case 'experiment':
      return (
        <>
          <p className="min-w-0 [overflow-wrap:anywhere]">{field(entry, 'method')}</p>
          <Fact label="Sample size" value={field(entry, 'sample_size')} />
        </>
      );
    case 'observation':
      return (
        <>
          <MeasurementTable entry={entry} />
          <Fact label="Result" value={field(entry, 'result')} />
          <Fact label="Cost" value={field(entry, 'cost')} />
        </>
      );
    case 'evidence':
      return (
        <>
          <p className="min-w-0 [overflow-wrap:anywhere]">{field(entry, 'interpretation')}</p>
          <Fact label="Strength" value={field(entry, 'strength')} />
          <Fact label="Seed" value={field(entry, 'seed')} />
          {field(entry, 'analysis_call') ? (
            <AnalysisCall
              links={links}
              reference={field(entry, 'analysis_call')}
              session={entry.session || entry.branch}
            />
          ) : null}
        </>
      );
    case 'conclusion':
      return <ConclusionBody entry={entry} links={links} reference={reference} />;
    default:
      return entrySummary(entry) ? (
        <p className="min-w-0 [overflow-wrap:anywhere]">{entrySummary(entry)}</p>
      ) : null;
  }
}

function ConclusionBody({
  entry,
  links,
  reference,
}: {
  entry: ScienceEntry;
  links: ScienceCallLinks;
  reference: (id: string) => ReactNode;
}) {
  const claims = Array.isArray(entry.fields['claims']) ? entry.fields['claims'] : [];
  return (
    <>
      <ol className="grid min-w-0 list-decimal gap-1 pl-4">
        {claims.map((raw, index) => {
          const claim = (raw ?? {}) as Record<string, unknown>;
          const cites = Array.isArray(claim['cites'])
            ? claim['cites'].filter((id): id is string => typeof id === 'string')
            : [];
          return (
            <li className="min-w-0" key={index}>
              <p className="[overflow-wrap:anywhere]">{String(claim['text'] ?? '')}</p>
              {cites.length ? (
                <p className="flex min-w-0 flex-wrap gap-x-2 text-[11px]">
                  <span className="text-muted-foreground">Cites</span>
                  {cites.map((id) => (
                    <span className="min-w-0" key={id}>
                      {reference(id)}
                    </span>
                  ))}
                </p>
              ) : null}
              {typeof claim['analysis_call'] === 'string' && claim['analysis_call'] ? (
                <AnalysisCall
                  links={links}
                  reference={claim['analysis_call']}
                  session={entry.session || entry.branch}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      <Fact label="Confidence" value={field(entry, 'confidence')} />
      <Fact label="Caveats" value={field(entry, 'caveats')} />
      <Fact label="Relation to the question" value={field(entry, 'relation')} />
    </>
  );
}

function MeasurementTable({ entry }: { entry: ScienceEntry }) {
  const rows = measurements(entry);
  if (!rows.length) return null;
  const showConditions = rows.some((row) => row.conditions);
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-0 border-collapse text-[11px]">
        <caption className="sr-only">Measurements</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-0.5 pr-2 font-medium" scope="col">
              Metric
            </th>
            <th className="py-0.5 pr-2 text-right font-medium" scope="col">
              Value
            </th>
            <th className="py-0.5 pr-2 font-medium" scope="col">
              Unit
            </th>
            {showConditions ? (
              <th className="py-0.5 font-medium" scope="col">
                Conditions
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr className="border-b border-border/50 last:border-0" key={index}>
              <td className="py-0.5 pr-2">{row.metric}</td>
              <td className="py-0.5 pr-2 text-right tabular-nums">{row.value}</td>
              <td className="py-0.5 pr-2 text-muted-foreground">{row.unit}</td>
              {showConditions ? (
                <td className="py-0.5 text-muted-foreground">{row.conditions}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function budget(value: unknown): string {
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value : '';
  const row = value as Record<string, unknown>;
  return [row['amount'], row['unit']].filter((part) => part !== undefined && part !== '').join(' ');
}

function formatTime(timestamp: string): string {
  const time = new Date(timestamp);
  if (Number.isNaN(time.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    time,
  );
}
