import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Client } from '@clio/core';
import { Chip, Eyebrow, Icon, Layer, Popover, Tabs, ToolbarButton } from '../kit';
import { Markdown } from '../transcript/markdown';
import type { ArtifactRecord, RouteEdge, RouteNode, RouteStep } from './types';
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
   * (the prototype's `artLoc`). When absent the identity header's storage
   * affordance omits the ↗ open control — never a dead affordance.
   */
  onOpenStorage?: (storage: { path: string; workspaceId?: string }) => void;
  /**
   * Navigates the CENTER view to another session — the provenance graph's
   * cross-session channel (gact-tui#355 drawn into the graph): a foreign
   * cluster header click, or an activity-line click when the producing
   * session is known. Same channel as the obs layer's agent navigation.
   * When absent those lines render inert — no fake affordance.
   */
  onOpenSession?: (sessionId: string) => void;
  /**
   * Opens another artifact of the lineage graph in this panel, PUSHING the
   * detail stack (the existing provenance push-onto-stack behavior,
   * rightStack.ts `openRightEntry(..., { push: true })`). When absent,
   * non-self artifact lines render inert.
   */
  onOpenArtifact?: (artifactId: string) => void;
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
export function DetailSlot({
  record,
  onClose,
  client,
  onOpenStorage,
  onOpenSession,
  onOpenArtifact,
}: DetailSlotProps) {
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
      <IdentityHeader record={record} onClose={onClose} {...(onOpenStorage ? { onOpenStorage } : {})} />

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
        {tab === 'artifact' ? <Overview record={record} /> : null}
        {tab === 'provenance' ? (
          <Provenance
            record={record}
            {...(onOpenSession ? { onOpenSession } : {})}
            {...(onOpenArtifact ? { onOpenArtifact } : {})}
          />
        ) : null}
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
          label="Collapse artifact panel"
          title="Collapse artifact panel"
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

      {body}
    </aside>
  );
}

/**
 * The identity header — panel CHROME, not tab content: sits ABOVE the
 * artifact|provenance|recreate tab strip (shared by every tab, not just
 * Overview) as a compact 3-line block (owner refinement 2026-08-05, second
 * pass on the 2026-08-05 identity-block redesign).
 *
 * Line 1: the crumb prefix ("session ›", tiny) directly before the artifact
 * NAME — shown exactly ONCE now. The prior pass still repeated the name
 * between the breadcrumb's trailing (self) crumb and the Overview tab's own
 * title; the owner circled that repetition, so the breadcrumb no longer
 * renders its own last segment at all — `artifactDisplayName` already reads
 * that same segment for the title. The kind chip sits right-aligned on the
 * same line.
 *
 * Line 2: the compact metadata affordances (size · id · sha · storage) on
 * one line, via {@link MetaLine}.
 *
 * Line 3: the note/description, small, muted, full width.
 */
function IdentityHeader({
  record,
  onClose,
  onOpenStorage,
}: {
  record: ArtifactRecord;
  onClose: () => void;
  onOpenStorage?: DetailSlotProps['onOpenStorage'];
}) {
  const displayName = artifactDisplayName(record);
  // Every crumb but the last is a real ancestor stop; the last is the
  // record's own (self) name, already shown once as the title below.
  const breadcrumbPrefix = record.breadcrumb ? record.breadcrumb.slice(0, -1) : [];

  return (
    <div className="detail__identityheader" data-testid="detail-identity">
      <div className="detail__titleline">
        <div className="detail__titlemain">
          <CrumbPrefix crumbs={breadcrumbPrefix} onClose={onClose} />
          <h3 className="detail__title" data-testid="detail-title" title={displayName}>
            {displayName}
          </h3>
        </div>
        {record.kind ? <Chip>{record.kind}</Chip> : null}
      </div>
      <MetaLine record={record} {...(onOpenStorage ? { onOpenStorage } : {})} />
      {record.note ? (
        <p className="detail__note" data-testid="detail-note">
          {record.note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The ancestor breadcrumb trail before the title (proto crumbs[]/c.go,
 * design/prototype/Clio Session.html): every crumb but the record's own
 * (self) segment, which the caller already excludes. Only the first
 * ("session") crumb has a real, well-defined destination today — this app
 * has no multi-level detail stack yet (a single record, not a drill-down
 * chain — E7's reachability gap covers minting the chain), so going up from
 * a single-level record means leaving the detail slot entirely, i.e.
 * onClose. Deeper ancestor crumbs (none exist yet, but the shape allows
 * them) stay display-only rather than wired to a stack level that doesn't
 * exist in the data model — an honest scope limit, not a silent drop.
 */
function CrumbPrefix({ crumbs, onClose }: { crumbs: string[]; onClose: () => void }) {
  if (crumbs.length === 0) return null;
  return (
    <nav className="detail__crumbs" aria-label="Detail breadcrumb">
      {crumbs.map((crumb, index) => (
        <span key={`${crumb}-${index}`}>
          {index > 0 ? <span className="detail__crumbsep">›</span> : null}
          {index === 0 ? (
            <button type="button" className="detail__crumbbtn" onClick={onClose}>
              {crumb}
            </button>
          ) : (
            <span>{crumb}</span>
          )}
        </span>
      ))}
      <span className="detail__crumbsep" aria-hidden="true">
        ›
      </span>
    </nav>
  );
}

/**
 * The identity header's compact metadata line: size · id · sha · storage, on
 * one row. Owner 3c (2026-08-06): middot separators are DELETED from the
 * detail panel — each segment is its own small chip, separated by spacing
 * alone. Each segment is optional except the id (always present); only
 * segments with real data render — nothing is padded or fabricated.
 */
function MetaLine({
  record,
  onOpenStorage,
}: {
  record: ArtifactRecord;
  onOpenStorage?: DetailSlotProps['onOpenStorage'];
}) {
  const items: { key: string; node: ReactNode }[] = [];
  if (record.size) {
    items.push({
      key: 'size',
      node: <span className="detail__metasize detail__metachip">{record.size}</span>,
    });
  }
  items.push({
    key: 'id',
    node: (
      <span
        className="detail__metaid detail__metachip"
        data-testid="detail-meta-id"
        title={record.id}
      >
        {truncateMiddle(record.id, ID_TRUNCATE_MAX)}
      </span>
    ),
  });
  if (record.sha) {
    items.push({ key: 'sha', node: <ShaField sha={record.sha} /> });
  }
  if (record.storagePath) {
    items.push({
      key: 'storage',
      node: (
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
      ),
    });
  }

  return (
    <div className="detail__metaline" data-testid="detail-meta">
      {items.map((item) => (
        <Fragment key={item.key}>{item.node}</Fragment>
      ))}
    </div>
  );
}

/** Max visible characters before the meta line's artifact id truncates from
 *  the middle (owner redesign 2026-08-05) — high enough that today's real
 *  ids (`art_`/`artifact_` + a short hex suffix) render in full; a
 *  genuinely long id still truncates rather than eating the panel width. */
const ID_TRUNCATE_MAX = 24;

/** Same convention for the storage path row. */
const PATH_TRUNCATE_MAX = 40;

/**
 * The artifact's human display name for the Overview title row. The
 * breadcrumb's last segment is always the real session-artifact `name`
 * (`mintArtifactRecord` sets `breadcrumb: ['session', record.name]`
 * unconditionally), so that is the honest source for "the file title" the
 * owner wants distinguished from the id. A record minted without a
 * breadcrumb (a bare fixture, or a future record shape) has no other name to
 * show, so it falls back to the id itself — never a fabricated label.
 */
function artifactDisplayName(record: ArtifactRecord): string {
  const crumbs = record.breadcrumb;
  const last = crumbs && crumbs.length > 0 ? crumbs[crumbs.length - 1] : undefined;
  return last || record.id;
}

/** Truncates the middle of `text`, keeping head and tail characters and a
 *  single ellipsis — the id/path/hash convention this app already uses
 *  elsewhere for compact identifiers (route labels, the `sha` fixture). */
function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const keep = Math.max(0, max - 1);
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

/** The sha's short display prefix — strips an optional `algo:` label
 *  (`sha256:…`) before taking the first `len` characters, so the compact
 *  affordance shows real hash characters, not the algorithm name. */
function shortSha(sha: string, len = 8): string {
  const bare = sha.includes(':') ? sha.slice(sha.indexOf(':') + 1) : sha;
  return bare.length <= len ? bare : bare.slice(0, len);
}

type CopyStatus = 'idle' | 'copied' | 'selected';

/**
 * Selects `node`'s full text so a clipboard-API failure still leaves the
 * value selected for a manual Ctrl+C — never a silent no-op. Best-effort
 * only: the full value is already rendered as real text regardless of
 * whether the Selection API itself is available/succeeds.
 */
function selectFullText(node: Node | null): void {
  if (!node) return;
  try {
    const selection = window.getSelection?.();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Selection is a convenience on top of the real fallback (the full
    // value is already in the DOM as text) — never worth crashing the click.
  }
}

/**
 * The Overview (artifact) tab body. Owner refinement 2026-08-05, second
 * pass: the identity (name/kind/meta/note) is panel CHROME now — it moved to
 * {@link IdentityHeader}, shared above the tab strip — so this tab holds
 * ONLY the content preview, nothing repeated from the header.
 */
function Overview({ record }: { record: ArtifactRecord }) {
  return <div data-testid="detail-overview">{record.preview ? <Preview preview={record.preview} /> : null}</div>;
}

/**
 * The sha's compact affordance: a short mono prefix, the full hash on hover
 * (title attr), and a click that copies the full hash — with an honest
 * transient outcome (a 'copied' text swap on success, the full hash shown
 * selected on a clipboard failure, never a pretend confirmation).
 */
function ShaField({ sha }: { sha: string }) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const valueRef = useRef<HTMLSpanElement | null>(null);

  // Selection has to run AFTER the DOM shows the full hash (the 'selected'
  // render below), not against the still-short text at click time.
  useEffect(() => {
    if (status === 'selected') selectFullText(valueRef.current);
  }, [status]);

  async function handleClick(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('clipboard API unavailable');
      await navigator.clipboard.writeText(sha);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 1200);
    } catch {
      // No silent fallback: a denied/unavailable clipboard still leaves the
      // real full hash on screen, selected, instead of pretending it copied.
      setStatus('selected');
    }
  }

  const label = status === 'copied' ? 'copied' : status === 'selected' ? sha : shortSha(sha);

  return (
    <button
      type="button"
      className="detail__sha"
      data-testid="detail-sha"
      title={sha}
      onClick={() => void handleClick()}
    >
      <span className="detail__shakey">sha</span>
      <span className="detail__shaval" ref={valueRef}>
        {label}
      </span>
    </button>
  );
}

/**
 * The prototype's persistent storage row under the meta line (`storage
 * <path> ↗`, proto-d1 / artLoc): where the version's bytes actually live.
 * The path itself is always copyable (owner redesign 2026-08-05: compact
 * grammar matching the sha field — truncated middle, full path on hover,
 * click copies). The ↗ open-in-files affordance stays separate and is only
 * rendered when a real destination is threaded (the workspace files layer);
 * without one, showing it would be a dead affordance.
 */
function StorageRow({ path, onOpen }: { path: string; onOpen?: () => void }) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const valueRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (status === 'selected') selectFullText(valueRef.current);
  }, [status]);

  async function handleCopy(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('clipboard API unavailable');
      await navigator.clipboard.writeText(path);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 1200);
    } catch {
      setStatus('selected');
    }
  }

  const label =
    status === 'copied' ? 'copied' : status === 'selected' ? path : truncateMiddle(path, PATH_TRUNCATE_MAX);

  return (
    <div className="detail__storage" data-testid="detail-storage">
      <span className="detail__storagekey">storage</span>
      <button
        type="button"
        className="detail__storagepath"
        data-testid="detail-storage-copy"
        title={path}
        onClick={() => void handleCopy()}
      >
        <span ref={valueRef}>{label}</span>
      </button>
      {onOpen ? (
        <button
          type="button"
          className="detail__storagego"
          data-testid="detail-storage-open"
          title="Open in workspace files"
          aria-label="Open in workspace files"
          onClick={onOpen}
        >
          ↗
        </button>
      ) : null}
    </div>
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

/**
 * The provenance tab (rework, docs/design/provenance-graph-2026-08.md): ONE
 * compact axes line directly under the tab strip, then the lineage graph —
 * one line per node, connector-rail edges, foreign-session clusters. The
 * mechanism/designation/evidence/custody KvGrid and BOTH record folds
 * (VERSION RECORD / TRANSFORM RECORD) are DELETED per the spec: their rows
 * ride the identity header, this line, and the graph itself; the Recreate tab
 * keeps the full transform detail.
 */
function Provenance({
  record,
  onOpenSession,
  onOpenArtifact,
}: {
  record: ArtifactRecord;
  onOpenSession?: (sessionId: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const route = record.route ?? [];
  return (
    <div data-testid="detail-provenance">
      <ProvenanceLine record={record} />
      <div className="detail__section">
        <Eyebrow>lineage</Eyebrow>
        {route.length === 0 ? (
          <p className="detail__absent" data-testid="route-absent">
            No route recorded for this artifact.
          </p>
        ) : (
          <LineageGraphView
            route={route}
            {...(record.sessionTitles ? { sessionTitles: record.sessionTitles } : {})}
            {...(onOpenSession ? { onOpenSession } : {})}
            {...(onOpenArtifact ? { onOpenArtifact } : {})}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The compact provenance line — the four axes dot-separated on one muted mono
 * line (two only if it wraps at 320px). Always all four, in order; a missing
 * axis is stated as unrecorded rather than omitted, so "we don't know" never
 * looks like "not applicable" (the deleted KvGrid's honesty rule, kept).
 *
 * Owner 3c (2026-08-06): the middot separators are DELETED — each axis
 * renders as its own small chip, spaced apart, never dot-joined. Owner 3c
 * also requires every provenance vocabulary term to carry a plain-words
 * hover expansion (a `title` attr) — {@link PROVENANCE_GLOSSARY} below is
 * derived honestly from the real wire vocabulary (clio-agent's artifact
 * provenance design + the `clio_schemas` enums it ships:
 * `Mechanism`/`Custody`/`EvidenceClass`, and the designation/edge-evidence
 * strings `minting.py`/`transform_edges.py` actually mint) — never invented.
 */
const PROVENANCE_GLOSSARY: Record<string, string> = {
  // mechanism (clio_schemas.Mechanism) — what produced the record.
  harness: 'the harness itself performed the operation — exact attribution',
  'tool-schema': "minted from the tool's declared output schema",
  'change-feed': 'attributed from file-change events correlated to a lease window',
  model: 'the model designated this artifact — an untrusted assertion',
  none: 'no producing activity could be attributed',
  // designation — how the artifact path was named as an artifact.
  'agent-proposed': 'the agent proposed this path via the create_artifact tool',
  'tool-arg': "minted from a tool's declared output-path argument",
  'tool-result': "minted from a key in the tool's structured result",
  'pack-declared': 'declared by an agent-blueprint workflow — the weaker, optional channel',
  'reconcile-observed': 're-linked by content hash after a custody gap, not freshly designated',
  // evidence (clio_schemas.EvidenceClass) — how identity is known.
  'hashed-at-use': 'bytes were hashed (sha256) while the harness had them in hand',
  'authority-asserted':
    'identity comes from an external authority (a DOI, registry checksum, or provider manifest), not a local hash',
  'stat-pinned': 'identity is size + mtime only — the weakest evidence class',
  // custody (clio_schemas.Custody) — where the bytes live.
  cas: "bytes live in the app's own content-addressed store",
  'workspace-referenced': 'bytes stay in the workspace; identity is pinned by the evidence class at time of use',
  'external-referenced': 'bytes stay outside any workspace the app controls',
  // edge verbs (lineage.py: generated activity→artifact, used artifact→activity).
  generated: 'this activity produced the artifact as an output',
  used: 'this activity read the artifact as an input',
  revised: 'this version replaces an earlier version of the same artifact',
  derived: 'this artifact was derived from the other without a captured transform',
  // per-edge evidence (transform_edges.py: schema-arg | hash-pair | lease-window | authority | assertion).
  'schema-arg': "the edge is inferred from the tool's declared argument schema",
  'hash-pair': 'the edge is confirmed by matching content hashes on both sides',
  'lease-window': "the edge is attributed because only one activity held the territory's lease in this window",
  authority: "the edge rides an external authority's own record, not a local hash",
  assertion: "the edge is the model's own unverified claim",
  // the replay-contract status pill (design/artifact-provenance-design.md).
  reproducible:
    'environment tier and every input identity are pinned — replaying the instrument reproduces this exactly',
  're-runnable': 'the instrument can run again, but the environment or an input is not pinned enough to guarantee an identical result',
  gap: 'no transform was recorded for this step',
  failed: 'the activity did not complete successfully',
};

/** Best-effort glossary lookup: an axis value can carry free-form prose
 *  (the custody field observed live as `'workspace — data/'`) alongside the
 *  curated enum terms above — a plain substring match against the known
 *  vocabulary still surfaces the right definition without claiming one for
 *  text that isn't in the glossary at all. */
function glossaryTitle(value: string): string | undefined {
  if (PROVENANCE_GLOSSARY[value]) return PROVENANCE_GLOSSARY[value];
  const hit = Object.keys(PROVENANCE_GLOSSARY).find((term) => value.startsWith(term));
  return hit ? PROVENANCE_GLOSSARY[hit] : undefined;
}

function ProvenanceLine({ record }: { record: ArtifactRecord }) {
  const axes = [record.mechanism, record.designation, record.evidence, record.custody];
  return (
    <p className="detail__provline" data-testid="detail-prov-line">
      {axes.map((value, index) =>
        value ? (
          <Chip key={index} title={glossaryTitle(value)}>
            {value}
          </Chip>
        ) : (
          <Fragment key={index}>{unrecorded()}</Fragment>
        ),
      )}
    </p>
  );
}

/** One contiguous run of lineage lines: the viewing session's (no header) or
 *  a foreign session's cluster (dimmed rail + clickable header). An edge
 *  belongs to the cluster of the node it leads INTO (the following node). */
interface LineageSegment {
  /** The foreign producing session — undefined for the default context. */
  sessionId?: string;
  /** The cluster header's timestamp: the first (oldest) node's mint time. */
  createdAt?: string;
  steps: { step: RouteStep; index: number }[];
}

function segmentRoute(route: RouteStep[]): LineageSegment[] {
  const keyAt = (from: number): string | null => {
    for (let i = from; i < route.length; i += 1) {
      const step = route[i]!;
      if (step.kind === 'node') return step.foreignSession && step.sessionId ? step.sessionId : null;
    }
    return null;
  };
  const segments: LineageSegment[] = [];
  route.forEach((step, index) => {
    const key = keyAt(index);
    const last = segments[segments.length - 1];
    const lastKey = last ? (last.sessionId ?? null) : undefined;
    if (!last || lastKey !== key) {
      segments.push({ ...(key ? { sessionId: key } : {}), steps: [] });
    }
    const segment = segments[segments.length - 1]!;
    segment.steps.push({ step, index });
    if (step.kind === 'node' && step.createdAt && !segment.createdAt) {
      segment.createdAt = step.createdAt;
    }
  });
  return segments;
}

/** `sess_c6241fc8906f` → `sess_c624…` — the cluster header's compact id. */
function shortSessionId(sessionId: string): string {
  return sessionId.length > 10 ? `${sessionId.slice(0, 9)}…` : sessionId;
}

/** Max visible characters for a session title before it truncates from the
 *  middle — same convention as the identity header's id/path truncation. */
const SESSION_TITLE_TRUNCATE_MAX = 28;

/**
 * Any session REFERENCE (foreign cluster headers, an activity node's
 * producing-session tooltip) shows the session's real NAME/title, the id in
 * parens AT MOST, truncated (owner 3b, 2026-08-06) — never a bare raw
 * session id. `sessionTitles` is threaded from sessions the client already
 * has, or a cached `client.getSession` fetch for a foreign one
 * (SessionView); a lookup miss falls back to the short id alone, never
 * blank.
 */
function sessionLabel(sessionId: string, sessionTitles?: Record<string, string>): string {
  const title = sessionTitles?.[sessionId];
  const short = shortSessionId(sessionId);
  if (!title) return short;
  return `${truncateMiddle(title, SESSION_TITLE_TRUNCATE_MAX)} (${short})`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-08-05T12:43:10Z` → `05 Aug 12:43` (local time, mockup grammar). */
function clusterTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(at.getDate())} ${MONTHS[at.getMonth()]} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function LineageGraphView({
  route,
  sessionTitles,
  onOpenSession,
  onOpenArtifact,
}: {
  route: RouteStep[];
  sessionTitles?: Record<string, string>;
  onOpenSession?: (sessionId: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const segments = segmentRoute(route);
  return (
    <div className="detail__lineage" data-testid="route-graph">
      {segments.map((segment, si) =>
        segment.sessionId ? (
          <ForeignCluster
            key={`cluster-${segment.sessionId}-${si}`}
            segment={segment}
            {...(sessionTitles ? { sessionTitles } : {})}
            {...(onOpenSession ? { onOpenSession } : {})}
            {...(onOpenArtifact ? { onOpenArtifact } : {})}
          />
        ) : (
          <Fragment key={`run-${si}`}>
            {segment.steps.map(({ step, index }) =>
              step.kind === 'edge' ? (
                <EdgeLine key={index} edge={step} index={index} />
              ) : (
                <NodeLine
                  key={index}
                  node={step}
                  index={index}
                  {...(sessionTitles ? { sessionTitles } : {})}
                  {...(onOpenSession ? { onOpenSession } : {})}
                  {...(onOpenArtifact ? { onOpenArtifact } : {})}
                />
              ),
            )}
          </Fragment>
        ),
      )}
    </div>
  );
}

/**
 * A foreign session's cluster (spec rule 3): a one-line header — `● sess_…
 * · 05 Aug 12:43 ↗` — then the nodes it produced behind a dimmed `┆` rail.
 * The header is the click target (jumps to that session, the obs
 * agent-navigation channel); without a navigation callback it renders as a
 * plain line WITHOUT the ↗ — never a dead affordance.
 */
function ForeignCluster({
  segment,
  sessionTitles,
  onOpenSession,
  onOpenArtifact,
}: {
  segment: LineageSegment;
  sessionTitles?: Record<string, string>;
  onOpenSession?: (sessionId: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const sessionId = segment.sessionId!;
  const time = segment.createdAt ? clusterTime(segment.createdAt) : '';
  const label = sessionLabel(sessionId, sessionTitles);
  const headBody = (
    <>
      <span className="detail__clusterdot" aria-hidden="true">
        ●
      </span>
      <span className="detail__clustersess" title={sessionId}>
        {label}
      </span>
      {time ? <span className="detail__clustertime">{time}</span> : null}
      {onOpenSession ? (
        <span className="detail__clustergo" aria-hidden="true">
          ↗
        </span>
      ) : null}
    </>
  );
  return (
    <div className="detail__cluster" data-testid="route-cluster" data-session={sessionId}>
      {onOpenSession ? (
        <button
          type="button"
          className="detail__clusterhead"
          data-testid="route-cluster-header"
          title={`Open session ${sessionId}`}
          onClick={() => onOpenSession(sessionId)}
        >
          {headBody}
        </button>
      ) : (
        <div className="detail__clusterhead" data-testid="route-cluster-header">
          {headBody}
        </div>
      )}
      {segment.steps.map(({ step, index }) =>
        step.kind === 'edge' ? (
          <EdgeLine key={index} edge={step} index={index} dimRail />
        ) : (
          <NodeLine
            key={index}
            node={step}
            index={index}
            dimRail
            {...(sessionTitles ? { sessionTitles } : {})}
            {...(onOpenSession ? { onOpenSession } : {})}
            {...(onOpenArtifact ? { onOpenArtifact } : {})}
          />
        ),
      )}
    </div>
  );
}

const NODE_GLYPHS: Record<RouteNode['nodeType'], string> = {
  artifact: '◆',
  activity: '⚙',
  gap: '▢',
};

/**
 * ONE line per node (spec rule 1): glyph + name + inline muted sub-info,
 * never a bordered rectangle. The whole line is the hit target when it has a
 * real destination — a non-self artifact opens in the panel (push), an
 * activity jumps to its producing session; otherwise the line is inert.
 *
 * Owner 3c (2026-08-06): sub-info renders as small chips, never
 * middot-joined text. Owner round-6 cluster-fix: an IN-TREE producer (a
 * descendant session, not a true foreign one) gets a small inline agent-run
 * badge here instead of a cluster header. Owner 3a: the SELF node carries a
 * distinct `data-self` anchor treatment (detail.css) — max-left, prominent,
 * with edges flowing into and out of it via the surrounding lines as usual.
 */
function NodeLine({
  node,
  index,
  dimRail,
  sessionTitles,
  onOpenSession,
  onOpenArtifact,
}: {
  node: RouteNode;
  index: number;
  dimRail?: boolean;
  sessionTitles?: Record<string, string>;
  onOpenSession?: (sessionId: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const subParts: string[] = [];
  if (node.nodeType === 'gap') {
    subParts.push(node.gapReason ?? 'no transform recorded');
  } else if (node.nodeType === 'activity') {
    if (node.duration) subParts.push(node.duration);
  } else {
    if (node.version) subParts.push(node.version);
    if (node.size) subParts.push(node.size);
  }
  if (node.sub) subParts.push(node.sub);

  const open =
    node.nodeType === 'artifact' && !node.self && node.artifactId && onOpenArtifact
      ? () => onOpenArtifact(node.artifactId!)
      : node.nodeType === 'activity' && node.sessionId && onOpenSession
        ? () => onOpenSession(node.sessionId!)
        : undefined;

  const body = (
    <>
      {dimRail ? (
        <span className="detail__lrail" aria-hidden="true">
          ┆
        </span>
      ) : null}
      <span className="detail__lglyph" data-nodetype={node.nodeType} aria-hidden="true">
        {NODE_GLYPHS[node.nodeType]}
      </span>
      <span className="detail__lname">{node.label}</span>
      {node.treeSession && node.runLabel ? (
        <span className="detail__lbadge" data-testid="route-node-badge" title={`Run: ${node.runLabel}`}>
          {node.runLabel}
        </span>
      ) : null}
      {subParts.map((part, pi) => (
        <span key={pi} className="detail__lchip">
          {part}
        </span>
      ))}
      {node.status ? (
        <span className="detail__lpill" data-status={node.status} title={glossaryTitle(node.status)}>
          {node.status}
        </span>
      ) : null}
      {node.self ? <span className="detail__lselfmark">you are here</span> : null}
    </>
  );

  const testId = node.self ? 'route-node-self' : `route-node-${index}`;
  if (open) {
    return (
      <button
        type="button"
        className="detail__lnode"
        data-testid={testId}
        data-self={node.self ? 'true' : undefined}
        title={
          node.nodeType === 'activity'
            ? `Open producing session ${sessionLabel(node.sessionId!, sessionTitles)}`
            : 'Open artifact'
        }
        onClick={open}
      >
        {body}
      </button>
    );
  }
  return (
    <div className="detail__lnode" data-testid={testId} data-self={node.self ? 'true' : undefined}>
      {body}
    </div>
  );
}

/**
 * A connector line on the left rail (spec rule 2): `╰ verb → evidence`, the
 * evidence term teal. A `join` edge leads into a consumer that is not the
 * next line — the trailing `╮` elbow (multi-input branches, rule 4).
 */
function EdgeLine({ edge, index, dimRail }: { edge: RouteEdge; index: number; dimRail?: boolean }) {
  return (
    <div
      className="detail__ledge"
      data-testid={`route-edge-${index}`}
      data-join={edge.join ? 'true' : undefined}
    >
      {dimRail ? (
        <span className="detail__lrail" aria-hidden="true">
          ┆
        </span>
      ) : null}
      <span className="detail__lelbow" aria-hidden="true">
        ╰
      </span>
      <span className="detail__ledgeverb" title={glossaryTitle(edge.edge)}>
        {edge.edge}
      </span>
      {edge.stance ? (
        <>
          <span className="detail__ledgearrow" aria-hidden="true">
            →
          </span>
          <span className="detail__ledgeevidence" title={glossaryTitle(edge.stance)}>
            {edge.stance}
          </span>
        </>
      ) : null}
      {edge.join ? (
        <span className="detail__ljoin" aria-hidden="true">
          ╮
        </span>
      ) : null}
    </div>
  );
}

/**
 * The recreate tab — the ONE remaining home of the full transform detail
 * (the provenance tab's TRANSFORM RECORD fold is deleted, provenance rework
 * 2026-08): the instrument, or the stated absence, plus the replay-contract
 * pill when the record carries one (the deleted fold's pill, kept honest).
 */
function Recreate({ record }: { record: ArtifactRecord }) {
  if (!record.instrument) {
    return (
      <p className="detail__absent" data-testid="recreate-absent">
        This artifact has no recorded instrument, so it cannot be recreated from
        the trace.
      </p>
    );
  }
  return (
    <div data-testid="detail-recreate">
      <div className="detail__recreatehead">
        <Eyebrow>instrument</Eyebrow>
        {record.transformStatus ? (
          <span
            className="detail__lpill"
            data-status={record.transformStatus}
            data-testid="recreate-status"
            title={glossaryTitle(record.transformStatus)}
          >
            {record.transformStatus}
          </span>
        ) : null}
      </div>
      <pre className="detail__instrument">{record.instrument}</pre>
    </div>
  );
}

function unrecorded() {
  return <span className="detail__unrecorded">unrecorded</span>;
}
