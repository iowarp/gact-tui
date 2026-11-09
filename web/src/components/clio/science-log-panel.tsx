import type { ScienceEntry } from '@clio/core/v3';
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EntryKindIcon, ScienceStatus } from './science-log-icons';
import {
  ENTRY_TYPE_LABELS,
  derivedFrom,
  entryReference,
  entryState,
  entrySummary,
  lineage,
  measurements,
  outgoing,
  scienceEntryDomId,
  sourceFiles,
  type EntryEdge,
} from './science-log-model';
import {
  AnalysisCall,
  ObservationSources,
  type ScienceCallLinks,
  type ScienceFileReference,
} from './science-log-sources';

export interface ScienceLogListProps {
  /** The entries the log shows, in the order they were written. */
  entries: readonly ScienceEntry[];
  /** Every entry of the study, to name a link's target in another branch. */
  byId: ReadonlyMap<string, ScienceEntry>;
  /** Branch titles by session id. */
  titles: ReadonlyMap<string, string>;
  backlinks: ReadonlyMap<string, EntryEdge[]>;
  /** The entry whose details are open below its row. */
  selectedEntry?: string;
  /** Pick a row: open its details, or close them when it is already open. */
  onPickEntry: (entryId: string) => void;
  /** Follow a citation to another entry, bringing it into view. */
  onSelectEntry: (entryId: string) => void;
  /** Scroll the transcript to a call an entry cites (a source or an analysis). */
  onViewCall?: (sessionId: string, callId: string) => void;
  /** A link to a cited file, when this surface carries it. */
  fileHref?: (file: ScienceFileReference) => string | undefined;
}

/**
 * The log as a flush list: each entry's kind, its key field and its state in
 * a fixed column. The selected entry opens below its row with its facts and
 * citations as aligned label and value rows.
 */
export function ScienceLogList({
  entries,
  byId,
  titles,
  backlinks,
  selectedEntry,
  onPickEntry,
  onSelectEntry,
  onViewCall,
  fileHref,
}: ScienceLogListProps) {
  const links: ScienceCallLinks = { onViewCall, fileHref, titles };
  return (
    <ol aria-label="Science log entries" className="min-w-0 py-1">
      {entries.map((entry) => {
        const selected = entry.id === selectedEntry;
        const name = `${ENTRY_TYPE_LABELS[entry.type]}: ${entrySummary(entry) || entry.id}`;
        const state = entryState(entry);
        return (
          <li
            aria-label={name}
            className="min-w-0 scroll-mt-2 outline-none"
            data-focused={selected || undefined}
            id={scienceEntryDomId(entry.id)}
            key={entry.id}
            tabIndex={-1}
          >
            <button
              aria-expanded={selected}
              aria-label={`${name}, ${state.label}`}
              className={cn(
                'grid min-h-8 w-full min-w-0 grid-cols-[14px_minmax(0,1fr)_88px] items-center gap-x-2.5 px-3 py-1.5 text-left text-[12.5px] leading-5 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                selected && 'bg-menu-highlight hover:bg-menu-highlight',
              )}
              data-entry-row=""
              onClick={() => onPickEntry(entry.id)}
              type="button"
            >
              <EntryKindIcon className="text-muted-foreground" type={entry.type} />
              <span className={cn('min-w-0', selected ? '[overflow-wrap:anywhere]' : 'truncate')}>
                {entrySummary(entry) || ENTRY_TYPE_LABELS[entry.type]}
              </span>
              <ScienceStatus state={state} />
            </button>
            {selected ? (
              <EntryDetails
                backlinks={backlinks.get(entry.id) ?? []}
                byId={byId}
                entry={entry}
                links={links}
                onSelectEntry={onSelectEntry}
                titles={titles}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

type Row = [label: string, value: ReactNode];

function EntryDetails({
  entry,
  byId,
  titles,
  backlinks,
  links,
  onSelectEntry,
}: {
  entry: ScienceEntry;
  byId: ReadonlyMap<string, ScienceEntry>;
  titles: ReadonlyMap<string, string>;
  backlinks: readonly EntryEdge[];
  links: ScienceCallLinks;
  onSelectEntry: (entryId: string) => void;
}) {
  const reference = (id: string) => {
    const target = byId.get(id);
    const elsewhere = target && target.branch !== entry.branch;
    return (
      <button
        className="min-w-0 text-left text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        key={id}
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
  // A conclusion's citations sit on its claims; an observation's derivations under Cites.
  const linked = outgoing(entry).filter(
    (edge) =>
      !(entry.type === 'conclusion' && edge.relation === 'cites') &&
      edge.relation !== 'derived from',
  );
  const rows: Row[] = [
    ...typeRows(entry, links, reference),
    ...(entry.type === 'observation' ? citeRows(entry, links, reference) : []),
  ];
  if (entry.status_reason) rows.push(['Status reason', entry.status_reason]);
  if (linked.length) rows.push(['Links', edgeList(linked, (edge) => edge.to, reference)]);
  if (backlinks.length)
    rows.push(['Cited by', edgeList(backlinks, (edge) => edge.from, reference)]);
  if (entry.created_at)
    rows.push([
      'Recorded',
      <time dateTime={entry.created_at} key="time">
        {formatTime(entry.created_at)}
      </time>,
    ]);
  return (
    <div className="mr-3 mb-2 ml-[30px] min-w-0 border-l pl-3">
      <dl
        aria-label={`Details of ${ENTRY_TYPE_LABELS[entry.type]}`}
        className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1 py-1.5 text-xs leading-5"
      >
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 [overflow-wrap:anywhere]">{value}</dd>
          </Fragment>
        ))}
      </dl>
      {entry.type === 'observation' ? <ObservationSources entry={entry} links={links} /> : null}
    </div>
  );
}

function edgeList(
  edges: readonly EntryEdge[],
  target: (edge: EntryEdge) => string,
  reference: (id: string) => ReactNode,
) {
  return (
    <ul className="grid min-w-0 gap-0.5">
      {edges.map((edge, index) => (
        <li className="flex min-w-0 items-baseline gap-1.5" key={index}>
          <span className="shrink-0 text-muted-foreground">
            {edge.relation.replaceAll('_', ' ')}
          </span>
          {reference(target(edge))}
        </li>
      ))}
    </ul>
  );
}

function field(entry: ScienceEntry, name: string): string {
  const value = entry.fields[name];
  if (value === undefined || value === null || value === '') return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function facts(entry: ScienceEntry, pairs: [string, string][]): Row[] {
  return pairs.flatMap(([label, name]) => {
    const value = field(entry, name);
    return value ? [[label, value] as Row] : [];
  });
}

/** The entry's facts by type; its key field is the row's title. */
function typeRows(
  entry: ScienceEntry,
  links: ScienceCallLinks,
  reference: (id: string) => ReactNode,
): Row[] {
  switch (entry.type) {
    case 'question': {
      const rows = facts(entry, [['Scope', 'scope']]);
      const amount = budget(entry.fields['budget']);
      return amount ? [...rows, ['Budget', amount]] : rows;
    }
    case 'hypothesis':
      return facts(entry, [
        ['Refuted if', 'refuting_prediction'],
        ['Formula', 'formula'],
      ]);
    case 'experiment':
      return facts(entry, [['Sample size', 'sample_size']]);
    case 'observation':
      return [...measurementRows(entry), ...facts(entry, [['Cost', 'cost']])];
    case 'evidence': {
      const rows = facts(entry, [
        ['Strength', 'strength'],
        ['Seed', 'seed'],
      ]);
      const call = field(entry, 'analysis_call');
      return call
        ? [
            ...rows,
            [
              'Analysis',
              <AnalysisCall
                key="analysis"
                links={links}
                reference={call}
                session={entry.session || entry.branch}
              />,
            ],
          ]
        : rows;
    }
    case 'conclusion':
      return [
        [
          'Claims',
          <ConclusionClaims entry={entry} key="claims" links={links} reference={reference} />,
        ],
        ...facts(entry, [
          ['Confidence', 'confidence'],
          ['Caveats', 'caveats'],
          ['Relation', 'relation'],
        ]),
      ];
    default:
      return [];
  }
}

/** One measurement as Metric, Value and Conditions rows; several as a small table. */
function measurementRows(entry: ScienceEntry): Row[] {
  const rows = measurements(entry);
  if (!rows.length) return [];
  if (rows.length === 1) {
    const [row] = rows;
    const value = [row!.value, row!.unit].filter(Boolean).join(' ');
    return [
      ['Metric', row!.metric],
      [
        'Value',
        <span className="tabular-nums" key="value">
          {value}
        </span>,
      ],
      ...(row!.conditions ? [['Conditions', row!.conditions] as Row] : []),
    ];
  }
  const showConditions = rows.some((row) => row.conditions);
  return [
    [
      'Measurements',
      <table className="w-full min-w-0 border-collapse" key="measurements">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-3 font-normal" scope="col">
              Metric
            </th>
            <th className="pr-3 text-right font-normal" scope="col">
              Value
            </th>
            {showConditions ? (
              <th className="font-normal" scope="col">
                Conditions
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td className="pr-3">{row.metric}</td>
              <td className="pr-3 text-right tabular-nums">
                {[row.value, row.unit].filter(Boolean).join(' ')}
              </td>
              {showConditions ? <td className="text-muted-foreground">{row.conditions}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>,
    ],
  ];
}

/** What an observation cites: the recorded runs behind it and the entries it derives from. */
function citeRows(
  entry: ScienceEntry,
  links: ScienceCallLinks,
  reference: (id: string) => ReactNode,
): Row[] {
  const scripts = new Map(
    sourceFiles(entry)
      .filter((file) => file.direction === 'script' && file.callId)
      .map((file) => [file.callId, file.path]),
  );
  const runs = lineage(entry).filter((row) => row.callId);
  const derived = derivedFrom(entry);
  if (!runs.length && !derived.length) return [];
  return [
    [
      'Cites',
      <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5" key="cites">
        {runs.map((row, index) => {
          const script = scripts.get(row.callId);
          const label = `${script ? basename(script) : row.tool || row.callId} run`;
          return links.onViewCall && row.session ? (
            <button
              aria-label={`${label}: view call ${row.callId} in transcript`}
              className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
              key={`${row.callId}:${index}`}
              onClick={() => links.onViewCall!(row.session, row.callId)}
              type="button"
            >
              {label}
            </button>
          ) : (
            <span key={`${row.callId}:${index}`}>{label}</span>
          );
        })}
        {derived.map((id) => reference(id))}
      </span>,
    ],
  ];
}

function ConclusionClaims({
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
    <ol className="grid min-w-0 list-decimal gap-1 pl-4">
      {claims.map((raw, index) => {
        const claim = (raw ?? {}) as Record<string, unknown>;
        const cites = Array.isArray(claim['cites'])
          ? claim['cites'].filter((id): id is string => typeof id === 'string')
          : [];
        return (
          <li className="min-w-0" key={index}>
            <p>{String(claim['text'] ?? '')}</p>
            {cites.length ? (
              <p className="flex min-w-0 flex-wrap gap-x-2">
                <span className="text-muted-foreground">Cites</span>
                {cites.map((id) => reference(id))}
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
  );
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
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
