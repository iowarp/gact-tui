import { useEffect, useState } from 'react';
import type { Client, McpServerInfo, PromptDef, SlashCommandDef } from '@clio/core';
import { Icon, type IconName } from '../../kit';
import { EmptyState, ErrorNote, LoadingNote, PageHeader } from './common';

function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[]): [T | null, string | null] {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    void fetcher()
      .then((v) => {
        if (!cancelled) setData(v);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [data, error];
}

const COMMAND_ICON: Record<string, IconName> = {
  compact: 'compact',
  review: 'diff',
  detach: 'detach',
  monitor: 'pulse',
  blueprint: 'bot',
  files: 'folder',
  runs: 'list',
  agents: 'swap',
  provider: 'swap',
};

/** Commands — slash commands available in the composer. */
export function CommandsPage({ client }: { client: Client }) {
  const [result, error] = useFetch(() => client.commands(), [client]);
  const header = (
    <PageHeader title="Commands" subtitle="Slash commands available in the composer." />
  );
  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (!result) return (<>{header}<LoadingNote /></>);
  const commands: SlashCommandDef[] = result.commands;
  return (
    <>
      {header}
      <div className="settings__list" data-gap="tight" style={{ maxWidth: 640 }}>
        {commands.map((cm) => (
          <div className="settings__row" key={cm.id}>
            <span style={{ color: 'var(--t-cy)', display: 'flex' }}>
              <Icon name={COMMAND_ICON[cm.id] ?? 'dots'} />
            </span>
            <span
              style={{
                width: 110,
                flexShrink: 0,
                fontFamily: 'var(--f-mono)',
                fontSize: 'calc(12.5px * var(--ts))',
                fontWeight: 600,
                color: 'var(--t-hd)',
              }}
            >
              /{cm.id}
            </span>
            <span
              style={{
                fontFamily: 'var(--f-prose)',
                fontSize: 'calc(14px * var(--ts))',
                color: 'var(--t-mu)',
              }}
            >
              {cm.description || cm.title}
            </span>
          </div>
        ))}
        {commands.length === 0 ? <p className="settings__note">No commands registered.</p> : null}
      </div>
    </>
  );
}

/** Prompts — saved prompt templates, insertable from the composer. */
export function PromptsPage({ client }: { client: Client }) {
  const [result, error] = useFetch(() => client.prompts(), [client]);
  const header = (
    <PageHeader
      title="Prompts"
      subtitle="Saved prompt templates, insertable from the composer."
    />
  );
  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (!result) return (<>{header}<LoadingNote /></>);
  const prompts: PromptDef[] = result.prompts;
  if (prompts.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No saved prompts"
          body="Save a prompt from the composer ⋯ menu and it will appear here."
        />
      </>
    );
  }
  return (
    <>
      {header}
      <div className="settings__list" data-gap="tight" style={{ maxWidth: 640 }}>
        {prompts.map((p) => (
          <div className="settings__row" key={p.id}>
            <div className="settings__rowbody">
              <span className="settings__rowname">{p.title || p.id}</span>
              {p.description ? <span className="settings__rowsub">{p.description}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const MCP_STATUS_COLOR: Record<string, string> = {
  ready: 'var(--t-ok)',
  starting: 'var(--t-wa)',
  error: 'var(--t-er)',
};

function mcpSubtext(server: McpServerInfo): string {
  if (server.status === 'ready') return `configured · ${server.tools_count} tools`;
  if (server.status === 'error') return server.error ? `error · ${server.error}` : 'error';
  if (server.status === 'starting') return 'starting…';
  return 'needs configuration';
}

/** MCP servers — tool servers reachable from the connected backend. */
export function McpPage({ client }: { client: Client }) {
  const [result, error] = useFetch(() => client.mcpServers(), [client]);
  const header = (
    <PageHeader title="MCP servers" subtitle="Tool servers reachable from the connected backend." />
  );
  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (!result) return (<>{header}<LoadingNote /></>);
  const servers: McpServerInfo[] = result.servers;
  return (
    <>
      {header}
      <div className="settings__list" style={{ maxWidth: 640 }}>
        {servers.map((s) => (
          <div className="settings__row" key={s.id}>
            <span
              className="settings__dot"
              style={{ background: MCP_STATUS_COLOR[s.status] ?? 'var(--t-mu)' }}
            />
            <span className="settings__rowname">{s.name}</span>
            <span className="settings__rowsub">{mcpSubtext(s)}</span>
          </div>
        ))}
        {servers.length === 0 ? (
          <p className="settings__note">No MCP servers reachable from this backend.</p>
        ) : null}
      </div>
    </>
  );
}
