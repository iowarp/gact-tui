import { useState, type ReactNode } from 'react';
import type { Client } from '@clio/core';
import { Chip, Eyebrow, Icon, KvGrid, Layer, Popover, Tabs, ToolbarButton, type KvRow } from '../kit';
import { Markdown } from '../transcript/markdown';
import type { ArtifactRecord, RouteStep } from './types';
import './detail.css';

export interface DetailSlotProps {
  record: ArtifactRecord;
  onClose: () => void;
  /**
   * Live backend connection, used ONLY by the Download menu (GET
   * /v1/artifacts/{artifact_id}/export — clio-agent #973, the RO-Crate
   * lineage bundle). Optional: DetailSlot has no live caller yet that opens
   * it against a real record (E7, tracked separately, is the reachability
   * gap) — without a client the control degrades honestly instead of
   * pretending a route it has no way to reach.
   */
  client?: Client;
  /**
   * Opens the workspace files layer at the artifact's storage location
   * (the prototype's `artLoc`). When absent the Overview's storage row
   * renders as a plain, non-interactive path — never a dead affordance.
   */
  onOpenStorage?: (storage: { path: string; workspaceId?: string }) => void;
}

type DetailTab = 'artifact' | 'provenance' | 'recreate';

/**
 * The detail slot — the prototype's right pane.
 *
 * Provenance and recreate render already-shipped #966 data, which is why this
 * surface has no P2/P3 dependency. Absence is always STATED: a record with no
 * route or no instrument says so, because a blank pane reads as "nothing here"
 * when the truth is "this was never captured".
 *
 * Reachability gap (tracked separately, E7 — "mint real artifacts and ground
 * the chips"): nothing in the live transcript opens this yet, only the
 * `?shell` fixture harness. This component fixes the CHROME the prototype
 * measures (kind badge, breadcrumb, copy/download, maximize) independent of
 * that wiring gap, so it is ready when E7 lands.
 */
export function DetailSlot({ record, onClose, client, onOpenStorage }: DetailSlotProps) {
  const [tab, setTab] = useState<DetailTab>('artifact');
  const [maximized, setMaximized] = useState(false);
  const [copied, setCopied] = useState(false);
  // rightOpen/tgRight in the prototype — a simple boolean flip between the
  // full panel and a 38px collapsed strip carrying only the re-expand
  // control and a vertical kind badge. Client-only layout state, same as
  // `maximized` above.
  const [collapsed, setCollapsed] = useState(false);
  // tgArtMenu/popArtMenu in the prototype — the Download button opens a
  // small menu (download file / open storage location / copy link) rather
  // than downloading directly.
  const [artMenuOpen, setArtMenuOpen] = useState(false);
  const [downloadState, setDownloadState] = useState<'idle' | 'pending' | 'error'>('idle');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const kind = record.recordKind ?? 'artifact';

  // GET /v1/artifacts/{artifact_id}/export (clio-agent #973) is the real
  // route behind BOTH "download file" and "copy link to artifact" — only
  // "open storage location" has no browser-reachable surface (desktop/OS
  // concern), so that row alone stays the honest degraded pattern.
  const exportUrl = client ? `${client.baseUrl}/v1/artifacts/${encodeURIComponent(record.id)}/export` : null;

  async function downloadArtifactFile(): Promise<void> {
    if (!client) return;
    setDownloadState('pending');
    setDownloadError(null);
    try {
      const { blob, filename } = await client.exportArtifact(record.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setDownloadState('idle');
      setArtMenuOpen(false);
    } catch (reason) {
      // No silent fallback: a failed export stays visible in the menu
      // (typed reason, not a swallowed rejection) so the user can retry
      // instead of clicking a control that quietly did nothing.
      setDownloadState('error');
      setDownloadError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function copyArtifactLink(): Promise<void> {
    if (!exportUrl) return;
    await navigator.clipboard?.writeText(exportUrl);
    setLinkCopied(true);
    setTimeout(() => {
      setLinkCopied(false);
      setArtMenuOpen(false);
    }, 900);
  }

  const body = (
    <>
      <div className="detail__tabs">
        <Tabs
          label="Detail views"
          activeId={tab}
          onChange={(id) => setTab(id as DetailTab)}
          tabs={[
            { id: 'artifact', label: 'artifact' },
            { id: 'provenance', label: 'provenance' },
            { id: 'recreate', label: 'recreate' },
          ]}
        />
      </div>

      <div className="detail__body">
        {tab === 'artifact' ? (
          <Overview record={record} {...(onOpenStorage ? { onOpenStorage } : {})} />
        ) : null}
        {tab === 'provenance' ? <Provenance record={record} /> : null}
        {tab === 'recreate' ? <Recreate record={record} /> : null}
      </div>
    </>
  );

  const copyMarkdown = () => {
    const lines = [
      `# ${record.id}`,
      record.kind ? `kind: ${record.kind}` : null,
      record.size ? `size: ${record.size}` : null,
      record.sha ? `sha: ${record.sha}` : null,
      record.note ? `\n${record.note}` : null,
    ].filter((line): line is string => line !== null);
    void navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (maximized) {
    return (
      <Layer open title={record.id} width={1120} onClose={() => setMaximized(false)}>
        {body}
      </Layer>
    );
  }

  if (collapsed) {
    return (
      <aside className="detail detail--strip" aria-label="Detail (collapsed)">
        <button
          type="button"
          className="detail__stripbtn"
          title="Expand panel"
          aria-label="Expand panel"
          onClick={() => setCollapsed(false)}
        >
          ‹
        </button>
        <span className="detail__stripbadge">{kind.toUpperCase()}</span>
      </aside>
    );
  }

  return (
    <aside className="detail" aria-label="Detail">
      <header className="detail__head">
        <Chip tone="accent">{kind.toUpperCase()}</Chip>
        <span className="detail__spacer" />
        {kind === 'artifact' ? (
          <div className="detail__artifactactions">
            <ToolbarButton
              label={copied ? 'Copied' : 'Copy as markdown'}
              title={copied ? 'Copied' : 'Copy'}
              iconOnly
              size="small"
              icon={<Icon name={copied ? 'check' : 'copy'} size={12} />}
              onClick={copyMarkdown}
            />
            {client ? (
              <ToolbarButton
                label="Download"
                title="Download"
                iconOnly
                size="small"
                icon={<Icon name="download" size={12} />}
                pressed={artMenuOpen}
                onClick={() => setArtMenuOpen((open) => !open)}
              />
            ) : (
              <ToolbarButton
                label="Download"
                title="Download requires a live connection — not available in this view."
                iconOnly
                size="small"
                icon={<Icon name="download" size={12} />}
                unbacked
                onClick={() => {}}
              />
            )}
            <Popover
              open={artMenuOpen}
              label="Artifact actions"
              placement="down"
              onClose={() => setArtMenuOpen(false)}
              style={{
                top: 28,
                left: 'auto',
                right: 0,
                minWidth: 180,
                background: 'var(--t-sf2)',
                border: '1px solid var(--t-bd35)',
                borderRadius: 8,
                padding: 4,
                boxShadow: '0 10px 28px rgba(0, 0, 0, .5)',
                zIndex: 60,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <button
                type="button"
                className="detail__artmenurow"
                disabled={downloadState === 'pending'}
                onClick={() => void downloadArtifactFile()}
              >
                {downloadState === 'pending' ? 'downloading…' : 'download file'}
              </button>
              {downloadState === 'error' ? (
                <p className="detail__artmenu-error">{downloadError ?? 'Download failed.'}</p>
              ) : null}
              {/* No browser API opens the host OS file manager — desktop-only,
                  the same honest-degraded pattern as the window chrome's
                  pop-out control. */}
              <button
                type="button"
                className="detail__artmenurow"
                data-unbacked="true"
                disabled
                title="Opening the OS file location is not wired — no browser API for it (desktop-only)."
              >
                open storage location
              </button>
              <button type="button" className="detail__artmenurow" onClick={() => void copyArtifactLink()}>
                {linkCopied ? 'copied' : 'copy link to artifact'}
              </button>
            </Popover>
          </div>
        ) : null}
        <ToolbarButton
          label="Maximize detail"
          title="Maximize"
          iconOnly
          size="small"
          icon={<Icon name="expand" size={12} />}
          onClick={() => setMaximized(true)}
        />
        <ToolbarButton
          label="Collapse panel"
          title="Collapse panel"
          iconOnly
          size="small"
          icon={<Icon name="panel-right" size={13} />}
          onClick={() => setCollapsed(true)}
        />
        <ToolbarButton
          label="Close detail"
          title="Close"
          iconOnly
          size="small"
          icon={<Icon name="x" size={11} />}
          onClick={onClose}
        />
      </header>

      {record.breadcrumb && record.breadcrumb.length > 0 ? (
        <nav className="detail__crumbs" aria-label="Detail breadcrumb">
          {record.breadcrumb.map((crumb, index) => {
            const isLast = index === record.breadcrumb!.length - 1;
            // Prototype truth (crumbs[]/c.go, design/prototype/Clio Session.html):
            // every crumb but the last drills the detail stack UP a level; the
            // last (self) crumb's own handler resets the stack to itself, an
            // observable no-op. This app has no multi-level detail stack yet
            // (a single record, not a drill-down chain — E7's reachability
            // gap covers minting the chain), so the only crumb with a real,
            // well-defined destination today is the first ("session"): going
            // up from a single-level record means leaving the detail slot
            // entirely, i.e. onClose. Later, non-first, non-last crumbs stay
            // display-only rather than wired to a stack level that does not
            // exist in the data model — an honest scope limit, not a silent
            // drop of prototype behavior.
            const clickable = index === 0 && !isLast;
            return (
              <span key={`${crumb}-${index}`}>
                {index > 0 ? <span className="detail__crumbsep">›</span> : null}
                {clickable ? (
                  <button type="button" className="detail__crumbbtn" onClick={onClose}>
                    {crumb}
                  </button>
                ) : (
                  <span className={isLast ? 'detail__crumbcurrent' : undefined}>{crumb}</span>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}

      {body}
    </aside>
  );
}

function Overview({
  record,
  onOpenStorage,
}: {
  record: ArtifactRecord;
  onOpenStorage?: DetailSlotProps['onOpenStorage'];
}) {
  const rows: KvRow[] = [{ key: 'id', value: record.id }];
  if (record.kind) rows.push({ key: 'kind', value: record.kind });
  if (record.size) rows.push({ key: 'size', value: record.size });
  if (record.sha) rows.push({ key: 'sha', value: record.sha });

  return (
    <div data-testid="detail-overview">
      <KvGrid label="Artifact identity" rows={rows} />
      {record.storagePath ? (
        <StorageRow
          path={record.storagePath}
          {...(onOpenStorage
            ? {
                onOpen: () =>
                  onOpenStorage({
                    path: record.storagePath!,
                    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
                  }),
              }
            : {})}
        />
      ) : null}
      {record.note ? <p className="detail__note">{record.note}</p> : null}
      {record.preview ? <Preview preview={record.preview} /> : null}
    </div>
  );
}

/**
 * The prototype's persistent storage row under the meta line (`storage
 * <path> ↗`, proto-d1 / artLoc): where the version's bytes actually live.
 * Clickable only when a real destination is threaded (the workspace files
 * layer); without one it is a plain path row, because an affordance that
 * does nothing is a lie.
 */
function StorageRow({ path, onOpen }: { path: string; onOpen?: () => void }) {
  const inner = (
    <>
      <span className="detail__storagekey">storage</span>
      <span className="detail__storagepath">{path}</span>
    </>
  );
  if (!onOpen) {
    return (
      <div className="detail__storage" data-testid="detail-storage">
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="detail__storage"
      data-testid="detail-storage"
      title="Open in workspace files"
      onClick={onOpen}
    >
      {inner}
      <span className="detail__storagego" aria-hidden="true">
        ↗
      </span>
    </button>
  );
}

const CSV_PAGE = 20;

/** The prototype's per-kind preview: CSV table (first rows + pager), inline
 * image, rendered markdown, plain text. */
function Preview({ preview }: { preview: NonNullable<ArtifactRecord['preview']> }) {
  const [shown, setShown] = useState(CSV_PAGE);
  if (preview.kind === 'image') {
    return (
      <div className="detail__preview" data-testid="detail-preview-image">
        <img src={preview.url} alt="artifact preview" />
      </div>
    );
  }
  if (preview.kind === 'markdown') {
    return (
      <div className="detail__preview" data-testid="detail-preview-markdown">
        <Markdown text={preview.text} />
      </div>
    );
  }
  if (preview.kind === 'csv') {
    const visible = preview.rows.slice(0, shown);
    const total = preview.totalRows ?? preview.rows.length;
    return (
      <div className="detail__preview" data-testid="detail-preview-csv">
        <table className="detail__csv">
          <thead>
            <tr>
              {preview.header.map((cell, i) => (
                <th key={i}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="detail__csvfoot">
          first {Math.min(shown, preview.rows.length)} of {total.toLocaleString()} rows
          {shown < preview.rows.length ? (
            <button type="button" className="detail__csvmore" onClick={() => setShown((n) => n + 50)}>
              show 50 more
            </button>
          ) : null}
        </p>
      </div>
    );
  }
  return (
    <pre className="detail__preview detail__previewtext" data-testid="detail-preview-text">
      {preview.text}
    </pre>
  );
}

function Provenance({ record }: { record: ArtifactRecord }) {
  // The four axes, always all four — a missing axis is shown as unrecorded
  // rather than omitted, so "we don't know" never looks like "not applicable".
  const rows: KvRow[] = [
    { key: 'mechanism', value: record.mechanism ?? unrecorded() },
    { key: 'designation', value: record.designation ?? unrecorded() },
    { key: 'evidence', value: record.evidence ?? unrecorded() },
    { key: 'custody', value: record.custody ?? unrecorded() },
  ];

  const route = record.route ?? [];

  // The prototype's VERSION RECORD fold: always all 8 rows, absences stated
  // (same convention as the axes grid above).
  const versionRows: KvRow[] = [
    { key: 'artifact_id', value: record.id },
    { key: 'sha256', value: record.sha ?? unrecorded() },
    { key: 'size', value: record.size ?? unrecorded() },
    { key: 'kind', value: record.kind ?? unrecorded() },
    { key: 'mechanism', value: record.mechanism ?? unrecorded() },
    { key: 'designation', value: record.designation ?? unrecorded() },
    { key: 'evidence', value: record.evidence ?? unrecorded() },
    { key: 'custody', value: record.custody ?? unrecorded() },
  ];

  return (
    <div data-testid="detail-provenance">
      <KvGrid label="Provenance" rows={rows} />

      <div className="detail__section">
        <Eyebrow>lineage</Eyebrow>
        {route.length === 0 ? (
          <p className="detail__absent" data-testid="route-absent">
            No route recorded for this artifact.
          </p>
        ) : (
          <ol className="detail__route">
            {route.map((step, index) => (
              <li key={index}>{renderStep(step, index)}</li>
            ))}
          </ol>
        )}
      </div>

      {/* The prototype's two collapsed record folds under the chain
          (provRec/provTr, proto-d2). */}
      <div className="detail__section">
        <RecordFold label="version record" testId="fold-version-record">
          <KvGrid label="Version record" rows={versionRows} />
        </RecordFold>
        <RecordFold
          label="transform record"
          testId="fold-transform-record"
          {...(record.transformStatus ? { pill: record.transformStatus } : {})}
        >
          <TransformRecordContent
            record={record}
            bodyTestId="fold-transform-body"
            absentTestId="fold-transform-absent"
          />
        </RecordFold>
      </div>
    </div>
  );
}

/**
 * One collapsed-by-default record fold (the prototype's `▸ version record` /
 * `▸ transform record` buttons — provRecOpen/provTrOpen state, chevron flip
 * on toggle). The optional pill is the transform's replay-contract label
 * (reproducible / re-runnable / gap), shown on the button itself.
 */
function RecordFold({
  label,
  pill,
  testId,
  children,
}: {
  label: string;
  pill?: string;
  testId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="detail__fold" data-testid={testId}>
      <button
        type="button"
        className="detail__foldbtn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="detail__foldchev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="detail__foldlabel">{label}</span>
        {pill ? (
          <span className="detail__foldpill" data-status={pill}>
            {pill}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="detail__foldbody" data-testid={`${testId}-body`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function renderStep(step: RouteStep, index: number) {
  if (step.kind === 'edge') {
    return (
      <div className="detail__edge" data-testid={`route-edge-${index}`}>
        <span className="detail__edgelabel">{step.edge}</span>
        {step.stance ? <Chip>{step.stance}</Chip> : null}
      </div>
    );
  }
  return (
    <div
      className="detail__node"
      data-self={step.self ? 'true' : undefined}
      data-testid={step.self ? 'route-node-self' : `route-node-${index}`}
    >
      <span className="detail__nodetype">{step.nodeType}</span>
      <span className="detail__nodelabel">{step.label}</span>
      {step.sub ? <span className="detail__nodesub">{step.sub}</span> : null}
    </div>
  );
}

/**
 * The transform-record content — the instrument, or the stated absence. ONE
 * owner shown in BOTH places the prototype shows it: the recreate tab and
 * the provenance tab's TRANSFORM RECORD fold (proto-d2).
 */
function TransformRecordContent({
  record,
  bodyTestId,
  absentTestId,
}: {
  record: ArtifactRecord;
  bodyTestId: string;
  absentTestId: string;
}) {
  if (!record.instrument) {
    return (
      <p className="detail__absent" data-testid={absentTestId}>
        This artifact has no recorded instrument, so it cannot be recreated from
        the trace.
      </p>
    );
  }
  return (
    <div data-testid={bodyTestId}>
      <Eyebrow>instrument</Eyebrow>
      <pre className="detail__instrument">{record.instrument}</pre>
    </div>
  );
}

function Recreate({ record }: { record: ArtifactRecord }) {
  return (
    <TransformRecordContent
      record={record}
      bodyTestId="detail-recreate"
      absentTestId="recreate-absent"
    />
  );
}

function unrecorded() {
  return <span className="detail__unrecorded">unrecorded</span>;
}
