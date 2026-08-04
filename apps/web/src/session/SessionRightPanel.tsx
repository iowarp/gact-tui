import { useEffect, useMemo, useState } from 'react';
import {
  fetchSessionArtifacts,
  fetchSessionContextState,
  type Client,
  type SessionArtifactRecord,
} from '@clio/core';
import { Eyebrow, Icon } from '../kit';
import './owner-surfaces.css';

export type RightPanelKind = 'files' | 'artifacts' | 'context';

interface FileRow {
  path: string;
  size?: number;
  language?: string;
  mime?: string;
  type?: string;
}

export interface SessionRightPanelProps {
  client: Client;
  kind: RightPanelKind;
  sessionId?: string;
  workspaceId?: string;
  scope: string;
  workspaceLabel?: string;
  onClose: () => void;
}

function readableSize(value: number | undefined): string {
  if (value === undefined) return '';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value < 10_240 ? 1 : 0)} KB`;
}

/** The mutually-exclusive, live-data right pane owned by the topbar controls. */
export function SessionRightPanel({
  client,
  kind,
  sessionId,
  workspaceId,
  scope,
  workspaceLabel,
  onClose,
}: SessionRightPanelProps) {
  return (
    <aside className="session-right" data-testid={`right-panel-${kind}`} aria-label={`${kind} panel`}>
      <header className="session-right__header">
        <Icon name={kind === 'files' ? 'folder' : kind === 'artifacts' ? 'artifacts' : 'ctx'} size={14} />
        <strong>{kind === 'context' ? 'context' : kind}</strong>
        <span className="session-right__meta">{kind === 'files' ? workspaceLabel : sessionId}</span>
        <button type="button" aria-label={`Close ${kind}`} onClick={onClose}><Icon name="x" size={10} /></button>
      </header>
      {kind === 'files' ? (
        <FilesSurface client={client} workspaceId={workspaceId} />
      ) : kind === 'artifacts' ? (
        <ArtifactsSurface client={client} sessionId={sessionId} />
      ) : (
        <ContextSurface client={client} sessionId={sessionId} scope={scope} />
      )}
    </aside>
  );
}

function FilesSurface({ client, workspaceId }: { client: Client; workspaceId?: string }) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    setSelected(null);
    setContent('');
    if (!workspaceId) {
      setFiles([]);
      setState('ready');
      return;
    }
    let cancelled = false;
    setState('loading');
    void client.workspaceFiles(workspaceId, { limit: 500 }).then(
      (result) => {
        if (cancelled) return;
        setFiles(result.files);
        setState('ready');
      },
      () => {
        if (!cancelled) setState('failed');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, workspaceId]);

  const shown = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return files.filter((file) => !query || file.path.toLowerCase().includes(query));
  }, [files, filter]);

  async function openFile(file: FileRow): Promise<void> {
    if (!workspaceId || file.type === 'directory') return;
    setSelected(file.path);
    setContent('Loading file…');
    try {
      const result = await client.workspaceReadFile(workspaceId, file.path);
      setContent(result.content);
    } catch (reason) {
      setContent(`Could not read file: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }

  return (
    <div className="session-right__body session-files">
      <label className="session-files__filter"><Icon name="search" /><input aria-label="Filter workspace files" placeholder="Filter files" value={filter} onChange={(event) => setFilter(event.currentTarget.value)} /></label>
      {!workspaceId ? <p className="session-right__empty">No workspace is attached to this session.</p> : null}
      {state === 'loading' ? <p className="session-right__empty">Loading workspace files…</p> : null}
      {state === 'failed' ? <p className="session-right__error">Could not load workspace files.</p> : null}
      <div className="session-files__list">
        {shown.map((file) => (
          <button type="button" key={file.path} data-active={selected === file.path ? 'true' : undefined} onClick={() => void openFile(file)}>
            <Icon name={file.type === 'directory' ? 'folder' : 'doc'} />
            <span><strong>{file.path.split('/').at(-1)}</strong><small>{file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : file.language || file.mime || 'file'}</small></span>
            <small>{readableSize(file.size)}</small>
          </button>
        ))}
      </div>
      {selected ? <pre className="session-files__preview"><code>{content}</code></pre> : null}
    </div>
  );
}

function ArtifactsSurface({ client, sessionId }: { client: Client; sessionId?: string }) {
  const [artifacts, setArtifacts] = useState<SessionArtifactRecord[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    if (!sessionId) {
      setArtifacts([]);
      setState('ready');
      return;
    }
    let cancelled = false;
    setState('loading');
    void fetchSessionArtifacts(client, sessionId, { includeChildren: true }).then(
      (result) => {
        if (!cancelled) {
          setArtifacts(result.artifacts);
          setState('ready');
        }
      },
      () => {
        if (!cancelled) setState('failed');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, sessionId]);

  return (
    <div className="session-right__body session-artifacts">
      <Eyebrow strong>session artifacts</Eyebrow>
      {!sessionId ? <p className="session-right__empty">Select a session to inspect its artifacts.</p> : null}
      {state === 'loading' ? <p className="session-right__empty">Loading artifacts…</p> : null}
      {state === 'failed' ? <p className="session-right__error">Could not load artifacts.</p> : null}
      {state === 'ready' && sessionId && artifacts.length === 0 ? <p className="session-right__empty">No artifacts in this session or its children.</p> : null}
      {artifacts.map((artifact) => {
        const raw = artifact as SessionArtifactRecord & { size_bytes?: number };
        const latest = artifact.versions?.at(-1);
        const producer = latest?.producer;
        return (
          <article className="session-artifacts__row" key={artifact.head_artifact_id || artifact.name}>
            <Icon name="artifact" size={13} />
            <div><strong>{artifact.name}</strong><span>{artifact.kind || latest?.kind || 'artifact'}{producer?.tool ? ` · ${producer.tool}` : ''}</span></div>
            <small>{readableSize(latest?.size_bytes ?? raw.size_bytes)}</small>
          </article>
        );
      })}
    </div>
  );
}

function ContextSurface({ client, sessionId, scope }: { client: Client; sessionId?: string; scope: string }) {
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    if (!sessionId) {
      setSnapshot(null);
      setState('ready');
      return;
    }
    let cancelled = false;
    setState('loading');
    void fetchSessionContextState(client, sessionId, scope).then(
      (result) => {
        if (!cancelled) {
          setSnapshot(result as unknown as Record<string, unknown>);
          setState('ready');
        }
      },
      () => {
        if (!cancelled) setState('failed');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, scope, sessionId]);

  const used = typeof snapshot?.used_tokens === 'number' ? snapshot.used_tokens : null;
  const windowTokens = typeof snapshot?.window_tokens === 'number' ? snapshot.window_tokens : null;
  const rawPct = typeof snapshot?.used_pct === 'number' ? snapshot.used_pct : typeof snapshot?.pct_used === 'number' ? snapshot.pct_used : null;
  const percent = rawPct === null ? null : Math.round(rawPct <= 1 ? rawPct * 100 : rawPct);
  const categories = snapshot?.categories && typeof snapshot.categories === 'object' && !Array.isArray(snapshot.categories) ? Object.entries(snapshot.categories as Record<string, number>) : Array.isArray(snapshot?.categories) ? (snapshot.categories as Array<{ name?: string; tokens?: number }>).map((item) => [item.name || 'other', item.tokens || 0] as const) : [];

  return (
    <div className="session-right__body session-context">
      <Eyebrow strong>context usage</Eyebrow>
      {!sessionId ? <p className="session-right__empty">Select a session to inspect context usage.</p> : null}
      {state === 'loading' ? <p className="session-right__empty">Loading context telemetry…</p> : null}
      {state === 'failed' ? <p className="session-right__error">Could not load context telemetry.</p> : null}
      {snapshot ? (
        <>
          <div className="session-context__hero"><strong>{percent === null ? '—' : `${percent}%`}</strong><span>{used === null ? 'usage not observed' : `${used.toLocaleString()} / ${windowTokens?.toLocaleString() || '—'} tokens`}</span></div>
          <div className="session-context__bar"><span style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }} /></div>
          <Eyebrow strong>categories</Eyebrow>
          <dl className="session-context__categories">{categories.map(([label, tokens]) => <div key={label}><dt>{label}</dt><dd>{Number(tokens).toLocaleString()}</dd></div>)}</dl>
          <p className="session-context__wire">Live wire telemetry · scope {scope}</p>
        </>
      ) : null}
    </div>
  );
}
