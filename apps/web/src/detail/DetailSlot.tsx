import { useState } from 'react';
import { Chip, Eyebrow, Icon, KvGrid, Layer, Tabs, ToolbarButton, type KvRow } from '../kit';
import type { ArtifactRecord, RouteStep } from './types';
import './detail.css';

export interface DetailSlotProps {
  record: ArtifactRecord;
  onClose: () => void;
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
export function DetailSlot({ record, onClose }: DetailSlotProps) {
  const [tab, setTab] = useState<DetailTab>('artifact');
  const [maximized, setMaximized] = useState(false);
  const [copied, setCopied] = useState(false);
  const kind = record.recordKind ?? 'artifact';

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
        {tab === 'artifact' ? <Overview record={record} /> : null}
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

  return (
    <aside className="detail" aria-label="Detail">
      <header className="detail__head">
        <Chip tone="accent">{kind.toUpperCase()}</Chip>
        <span className="detail__spacer" />
        {kind === 'artifact' ? (
          <>
            <ToolbarButton
              label={copied ? 'Copied' : 'Copy as markdown'}
              title={copied ? 'Copied' : 'Copy'}
              iconOnly
              size="small"
              icon={<Icon name={copied ? 'check' : 'copy'} size={12} />}
              onClick={copyMarkdown}
            />
            {/* The prototype's Download opens a menu (download file / open
                storage location / copy link) — clio-agent serves no
                artifact-content route to back any of the three, so this stays
                the visible-degraded pattern (disabled + explanatory title)
                rather than a fabricated menu with nothing behind it. */}
            <ToolbarButton
              label="Download"
              title="Not wired — no artifact-download endpoint."
              iconOnly
              size="small"
              icon={<Icon name="download" size={12} />}
              unbacked
              onClick={() => {}}
            />
          </>
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
          {record.breadcrumb.map((crumb, index) => (
            <span key={`${crumb}-${index}`}>
              {index > 0 ? <span className="detail__crumbsep">/</span> : null}
              {crumb}
            </span>
          ))}
        </nav>
      ) : null}

      {body}
    </aside>
  );
}

function Overview({ record }: { record: ArtifactRecord }) {
  const rows: KvRow[] = [{ key: 'id', value: record.id }];
  if (record.kind) rows.push({ key: 'kind', value: record.kind });
  if (record.size) rows.push({ key: 'size', value: record.size });
  if (record.sha) rows.push({ key: 'sha', value: record.sha });

  return (
    <div data-testid="detail-overview">
      <KvGrid label="Artifact identity" rows={rows} />
      {record.note ? <p className="detail__note">{record.note}</p> : null}
    </div>
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

  return (
    <div data-testid="detail-provenance">
      <KvGrid label="Provenance" rows={rows} />

      <div className="detail__section">
        <Eyebrow>route</Eyebrow>
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
      <Eyebrow>instrument</Eyebrow>
      <pre className="detail__instrument">{record.instrument}</pre>
    </div>
  );
}

function unrecorded() {
  return <span className="detail__unrecorded">unrecorded</span>;
}
