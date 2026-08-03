import { useState } from 'react';
import { Chip, KvGrid, Select, Tabs } from '../kit';
import type { ObservabilityData } from './types';
import './observability.css';

export interface ObservabilityProps {
  data: ObservabilityData;
}

type ObsTab = 'agents' | 'runs' | 'tools' | 'artifacts' | 'context';

/**
 * The observability layer — the prototype's five tabs.
 *
 * Entirely kit composition. The tools tab in particular is the kit's proof
 * case: a per-expert dropdown filtering a list required no new primitive,
 * which is the whole argument for having a kit.
 */
export function Observability({ data }: ObservabilityProps) {
  const [tab, setTab] = useState<ObsTab>('agents');
  const experts = Object.keys(data.toolsByExpert);
  const [expert, setExpert] = useState(experts[0] ?? '');

  const isEmpty =
    data.agents.length === 0 &&
    data.runs.length === 0 &&
    experts.length === 0 &&
    data.artifacts.length === 0;

  return (
    <section className="obs" aria-label="Observability">
      {/* The heading and close control are the Layer's — see kit/Layer.tsx. */}
      <div className="obs__tabs">
        <Tabs
          label="Observability views"
          activeId={tab}
          onChange={(id) => setTab(id as ObsTab)}
          tabs={[
            { id: 'agents', label: 'agents', badge: data.agents.length || undefined },
            { id: 'runs', label: 'runs', badge: data.runs.length || undefined },
            { id: 'tools', label: 'tools' },
            { id: 'artifacts', label: 'artifacts', badge: data.artifacts.length || undefined },
            { id: 'context', label: 'context' },
          ]}
        />
      </div>

      <div className="obs__body">
        {isEmpty ? (
          <p className="obs__empty" data-testid="obs-empty">
            Nothing recorded for this session yet.
          </p>
        ) : null}

        {tab === 'agents' ? (
          <ul className="obs__list" data-testid="obs-agents">
            {data.agents.map((agent) => (
              <li className="obs__row" key={agent.id} style={{ paddingLeft: `${agent.depth * 14}px` }}>
                <span className="obs__label">{agent.label}</span>
                <Chip tone={agent.status === 'failed' ? 'error' : 'default'}>{agent.status}</Chip>
                {agent.duration ? <span className="obs__meta">{agent.duration}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {tab === 'runs' ? (
          <ul className="obs__list" data-testid="obs-runs">
            {data.runs.map((run) => (
              <li className="obs__row" key={run.id}>
                <span className="obs__mono">{run.id}</span>
                <span className="obs__meta">{run.agent}</span>
                <Chip tone={run.state === 'failed' ? 'error' : 'default'}>{run.state}</Chip>
                {run.duration ? <span className="obs__meta">{run.duration}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {tab === 'tools' ? (
          <div data-testid="obs-tools">
            <div className="obs__toolbar">
              <Select
                label="Expert"
                value={expert}
                options={experts.map((id) => ({ id, label: id }))}
                onChange={setExpert}
              />
              <span className="obs__meta" data-testid="obs-tools-count">
                {(data.toolsByExpert[expert] ?? []).length} tools
              </span>
            </div>
            <ul className="obs__list">
              {(data.toolsByExpert[expert] ?? []).map((tool) => (
                <li className="obs__row" key={tool.name}>
                  <span className="obs__mono">{tool.name}</span>
                  {tool.description ? <span className="obs__meta">{tool.description}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tab === 'artifacts' ? (
          <ul className="obs__list" data-testid="obs-artifacts">
            {data.artifacts.map((artifact) => (
              <li className="obs__row" key={artifact.id}>
                <span className="obs__label">{artifact.label}</span>
                {artifact.kind ? <span className="obs__meta">{artifact.kind}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {tab === 'context' ? (
          <div data-testid="obs-context">
            {data.context ? (
              // The denominator ships with the percentage: a bare "41%" cannot
              // be sanity-checked, and the limit is what makes it meaningful.
              <KvGrid
                label="Context"
                rows={[
                  { key: 'used', value: `${data.context.usedPercent}%` },
                  {
                    key: 'tokens',
                    value: `${data.context.tokens.toLocaleString('en-US')} / ${data.context.limit.toLocaleString('en-US')}`,
                  },
                ]}
              />
            ) : (
              <p className="obs__empty">No context measurement reported for this session.</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
