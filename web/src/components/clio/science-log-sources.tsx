import { parseCallReference, type ScienceEntry, type TransformFile } from '@clio/core/v3';
import { MessageSquareTextIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useTransformRecord } from '@/hooks/use-science-log';
import { vocab } from '@/lib/brand-vocabulary';
import { lineage, sourceFiles, type LineageRow, type SourceFile } from './science-log-model';

/** A file a study cites, as the surface can link it: a registered artifact or a path. */
export interface ScienceFileReference {
  artifactId?: string;
  path?: string;
}

/** How the log panel reaches the calls and files a study cites. */
export interface ScienceCallLinks {
  /** Scroll the transcript to one recorded call, in the session that made it. */
  onViewCall?: (sessionId: string, callId: string) => void;
  /** A link to a cited file, when this surface carries it (an export's included file). */
  fileHref?: (file: ScienceFileReference) => string | undefined;
  /** Branch titles by session id, to name the session that made a call. */
  titles: ReadonlyMap<string, string>;
}

function formatTime(timestamp: string): string {
  const time = new Date(timestamp);
  if (!timestamp || Number.isNaN(time.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(
    time,
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="min-w-0 [overflow-wrap:anywhere]">
      <span className="text-muted-foreground">{label}: </span>
      {children}
    </p>
  );
}

function ViewCall({
  session,
  callId,
  links,
}: {
  session: string;
  callId: string;
  links: ScienceCallLinks;
}) {
  if (!links.onViewCall || !session || !callId) return null;
  return (
    <Button
      aria-label={`View call ${callId} in transcript`}
      className="h-5 px-1.5 text-[11px]"
      onClick={() => links.onViewCall!(session, callId)}
      size="xs"
      type="button"
      variant="ghost"
    >
      <MessageSquareTextIcon aria-hidden="true" /> View in transcript
    </Button>
  );
}

/** A cited file: its path (linked when the surface carries it) and its hash. */
function FileLine({
  label,
  file,
  links,
}: {
  label: string;
  file: { artifactId: string; path: string; sha256: string };
  links: ScienceCallLinks;
}) {
  const name = file.path || file.artifactId || 'unnamed file';
  const href = links.fileHref?.({
    ...(file.artifactId ? { artifactId: file.artifactId } : {}),
    ...(file.path ? { path: file.path } : {}),
  });
  return (
    <li className="min-w-0 [overflow-wrap:anywhere]">
      <span className="text-muted-foreground">{label}: </span>
      {href ? (
        <a className="font-mono underline underline-offset-2" href={href}>
          {name}
        </a>
      ) : (
        <span className="font-mono">{name}</span>
      )}
      {file.sha256 ? (
        <span className="ml-1.5 font-mono text-muted-foreground" title="SHA-256">
          sha256 {file.sha256}
        </span>
      ) : null}
    </li>
  );
}

const DIRECTION_LABEL: Record<SourceFile['direction'], string> = {
  used: 'Read',
  generated: 'Wrote',
  script: 'Script',
};

function transformFile(file: TransformFile) {
  return {
    artifactId: file.artifact_id,
    path: file.path || file.name || file.external_ref,
    sha256: file.sha256,
  };
}

/**
 * What a cited call ran and where, from its record: the environment tier, the
 * script's hash, and (with `files`) its input and output files with hashes.
 * Read when shown.
 */
function CallRecord({
  callId,
  files,
  links,
}: {
  callId: string;
  files: boolean;
  links: ScienceCallLinks;
}) {
  const record = useTransformRecord(callId);
  if (record.isPending) return <p role="status">Reading the call&apos;s record…</p>;
  if (record.error)
    return (
      <p className="text-muted-foreground">
        The call&apos;s record is not available: {record.error.message}
      </p>
    );
  const { environment, instrument } = record.data;
  const versions = [
    environment.clio_version && `${vocab.agent} ${environment.clio_version}`,
    environment.python_version && `Python ${environment.python_version}`,
    environment.image_digest && `image ${environment.image_digest}`,
  ].filter(Boolean);
  return (
    <div className="grid min-w-0 gap-0.5" data-slot="science-call-record">
      <Fact label="Environment">
        {environment.tier || 'not recorded'}
        {versions.length ? (
          <span className="text-muted-foreground"> ({versions.join(', ')})</span>
        ) : null}
      </Fact>
      <Fact label="Script">
        {instrument.script_hash ? (
          <span className="font-mono">sha256 {instrument.script_hash}</span>
        ) : (
          'no script recorded'
        )}
        {instrument.cmd ? <span className="font-mono">, run as {instrument.cmd}</span> : null}
      </Fact>
      {files ? (
        <ul className="grid min-w-0 gap-0.5">
          {record.data.used.map((file, index) => (
            <FileLine
              file={transformFile(file)}
              key={`used:${index}`}
              label="Input"
              links={links}
            />
          ))}
          {record.data.generated.map((file, index) => (
            <FileLine
              file={transformFile(file)}
              key={`generated:${index}`}
              label="Output"
              links={links}
            />
          ))}
          {!record.data.used.length && !record.data.generated.length ? (
            <li className="text-muted-foreground">No files were recorded for this call.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/** One cited call of an observation: tool, arguments, times, result hash and its session. */
function SourceRow({
  row,
  files,
  open,
  links,
}: {
  row: LineageRow;
  files: readonly SourceFile[];
  open: boolean;
  links: ScienceCallLinks;
}) {
  const args = Object.keys(row.args).length ? JSON.stringify(row.args) : '';
  return (
    <li className="grid min-w-0 gap-0.5 border-l pl-2" data-slot="science-source">
      <p className="flex min-w-0 flex-wrap items-center gap-x-2">
        <span className="font-medium">{row.tool || 'tool call'}</span>
        <span className="font-mono text-muted-foreground">{row.callId}</span>
        <ViewCall callId={row.callId} links={links} session={row.session} />
      </p>
      {args ? (
        <Fact label="Arguments">
          <code className="font-mono">{args}</code>
        </Fact>
      ) : null}
      {row.startedAt || row.completedAt ? (
        <Fact label="Ran">
          {row.startedAt ? <time dateTime={row.startedAt}>{formatTime(row.startedAt)}</time> : null}
          {row.startedAt && row.completedAt ? ' to ' : null}
          {row.completedAt ? (
            <time dateTime={row.completedAt}>{formatTime(row.completedAt)}</time>
          ) : null}
        </Fact>
      ) : null}
      {row.digest ? (
        <Fact label="Result">
          <span className="font-mono" title="Result digest (SHA-256)">
            sha256 {row.digest}
          </span>
        </Fact>
      ) : null}
      {row.session ? (
        <Fact label="Called in">{links.titles.get(row.session) || row.session}</Fact>
      ) : null}
      {files.length ? (
        <ul className="grid min-w-0 gap-0.5">
          {files.map((file, index) => (
            <FileLine
              file={file}
              key={`${file.direction}:${index}`}
              label={DIRECTION_LABEL[file.direction]}
              links={links}
            />
          ))}
        </ul>
      ) : null}
      {open && row.callId ? <CallRecord callId={row.callId} files={false} links={links} /> : null}
    </li>
  );
}

/**
 * An observation's sources, collapsed by default: each recorded call behind it
 * with its tool, arguments, times, result hash and session, followable to the
 * call's turn in the transcript; the files the calls read and wrote; and, once
 * opened, each call's environment and script.
 */
export function ObservationSources({
  entry,
  links,
}: {
  entry: ScienceEntry;
  links: ScienceCallLinks;
}) {
  const [open, setOpen] = useState(false);
  const rows = lineage(entry);
  if (!rows.length) return null;
  const files = sourceFiles(entry);
  return (
    <details
      className="min-w-0 text-[11px]"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Sources ({rows.length})
      </summary>
      <ul className="mt-1 grid min-w-0 gap-1.5">
        {rows.map((row, index) => (
          <SourceRow
            files={files.filter((file) => !file.callId || file.callId === row.callId)}
            key={`${row.callId}:${index}`}
            links={links}
            open={open}
            row={row}
          />
        ))}
      </ul>
    </details>
  );
}

/**
 * The analysis call behind a claim or an Evidence entry: what it ran, its input
 * files with their hashes and its environment, followable to its turn in the
 * transcript. Collapsed by default; the record is read when opened.
 */
export function AnalysisCall({
  reference,
  session,
  links,
}: {
  reference: string;
  /** The session of the entry, for a reference that names no session. */
  session: string;
  links: ScienceCallLinks;
}) {
  const [open, setOpen] = useState(false);
  const call = parseCallReference(reference);
  if (!call.callId) return null;
  return (
    <details
      className="min-w-0 text-[11px]"
      data-slot="science-analysis"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Analysis: <span className="font-mono">{call.callId}</span>
      </summary>
      <div className="mt-1 grid min-w-0 gap-0.5 border-l pl-2">
        <p>
          <ViewCall callId={call.callId} links={links} session={call.session || session} />
        </p>
        {open ? <CallRecord callId={call.callId} files links={links} /> : null}
      </div>
    </details>
  );
}
