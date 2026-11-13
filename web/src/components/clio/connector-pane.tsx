import type { Connector, ConnectorNeed, ConnectorScope } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useConnectorActions, useConnectorChanges } from '@/hooks/use-connectors';
import { useInstalledAgents } from '@/hooks/use-session-agent';
import { connectorStatus, scopeWords, type ConnectorChange } from '@/lib/connector-presentation';
import { DeleteIcon } from '@/lib/icon-vocabulary';
import { ConnectorLogo, ConnectorNeedRows } from './connector-need-rows';
import { draftValues, unfilledRequired, type ConnectorDraft } from '@/lib/connector-draft';
import { DetailPane } from './primitives/detail-pane';
import { IconButton } from './primitives/icon-button';
import { KeyValueGrid } from './primitives/key-value-grid';
import { RowConfirm } from './primitives/row-confirm';
import { StatusIndicator } from './primitives/status-indicator';
import { SettingsGroupLabel, SettingsRow } from './settings-row';

/**
 * The setup card in the Extensions detail pane (CN4): the logo, the name, the state in
 * words, one row for each need, and where the connector applies (CN10).
 */
export function ConnectorPane({
  connector,
  onClose,
  onSignIn,
  className,
}: {
  connector: Connector;
  onClose: () => void;
  onSignIn: (connector: Connector, need: ConnectorNeed) => void;
  className?: string;
}) {
  const actions = useConnectorActions();
  const [draft, setDraft] = useState<ConnectorDraft>({});
  const [removing, setRemoving] = useState(false);
  // A connector added by URL or command can be removed; a catalog entry is turned off.
  const removable = connector.source === 'custom';
  const change = useConnectorChanges().get(connector.id);
  const status = connectorStatus(connector, change);
  const values = draftValues(connector.needs, draft);
  const changed = Object.keys(values).length > 0;
  const saving = actions.save.isPending;
  const save = () => {
    if (!changed || saving) return;
    actions.save.mutate(
      { id: connector.id, values },
      // A saved secret is never shown again, so the field empties; the rest follow the service.
      { onSuccess: () => setDraft({}) },
    );
  };
  const missing = unfilledRequired(connector.needs, draft);
  return (
    <DetailPane
      actions={
        removable ? (
          <IconButton
            icon={<DeleteIcon />}
            label={`Remove ${connector.name}`}
            onClick={() => setRemoving(true)}
          />
        ) : undefined
      }
      className={className}
      icon={<ConnectorLogo className="size-5 text-[9px]" connector={connector} />}
      onClose={onClose}
      title={connector.name}
    >
      <div data-connector={connector.id} data-slot="connector-setup-card">
        {removing ? (
          <div className="mb-3">
            <RowConfirm
              action="Remove"
              busyAction="Removing…"
              onConfirm={async () => {
                await actions.remove.mutateAsync(connector.id);
                onClose();
              }}
              onKeep={() => setRemoving(false)}
              question={`Remove ${connector.name}?`}
            />
          </div>
        ) : null}
        <div className="flex min-w-0 items-center gap-2" data-slot="connector-state">
          <StatusIndicator label={status.label} tone={status.tone} />
        </div>
        {status.detail !== status.label ? (
          <p className="mt-1 text-xs leading-4 text-muted-foreground">{status.detail}</p>
        ) : null}
        {connector.description ? <p className="mt-3 leading-5">{connector.description}</p> : null}
        <KeyValueGrid
          className="mt-3"
          items={[
            { label: 'Source', value: connector.source === 'custom' ? 'Added by you' : 'Catalog' },
            ...(connector.tool_count === null
              ? []
              : [{ label: 'Tools', value: `${connector.tool_count}` }]),
            ...(connector.plugin ? [{ label: 'Brings plugin', value: connector.plugin }] : []),
          ]}
        />
        <SettingsGroupLabel>Setup</SettingsGroupLabel>
        {connector.needs.length ? (
          <>
            <ConnectorNeedRows
              disabled={saving}
              draft={draft}
              needs={connector.needs}
              onDraft={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
              onSignIn={(need) => onSignIn(connector, need)}
              onSubmit={save}
              submitLabel={`Set up ${connector.name}`}
            />
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
              <Button
                className="h-7 px-2.5 text-xs"
                disabled={!changed || saving}
                onClick={save}
                size="sm"
              >
                {saving ? 'Connecting…' : 'Save'}
              </Button>
              {changed ? (
                <Button
                  className="h-7 px-2.5 text-xs"
                  disabled={saving}
                  onClick={() => setDraft({})}
                  size="sm"
                  variant="ghost"
                >
                  Discard changes
                </Button>
              ) : null}
              {missing.length && !saving ? (
                <span className="text-xs text-muted-foreground">
                  {missing.length === 1
                    ? '1 required row is empty'
                    : `${missing.length} required rows are empty`}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="leading-5 text-muted-foreground">It needs nothing from you.</p>
        )}
        <ConnectorScopeControls change={change} connector={connector} />
      </div>
    </DetailPane>
  );
}

/**
 * Where the connector applies: every conversation, or the agents chosen (CN10), with
 * the same "Available in every conversation" switch an MCP connection has.
 */
function ConnectorScopeControls({
  connector,
  change,
}: {
  connector: Connector;
  change: ConnectorChange | undefined;
}) {
  const actions = useConnectorActions();
  const agents = useInstalledAgents();
  const current = connector.scope;
  const [every, setEvery] = useState(current ? current === 'all' : true);
  const [chosen, setChosen] = useState<string[]>(
    current && current !== 'all' ? current.agents : [],
  );
  const scope: ConnectorScope = every ? 'all' : { agents: chosen };
  // Pending here or from another place this connector appears: one state, in words (CN3).
  const busy = Boolean(change) || actions.enable.isPending || actions.disable.isPending;
  const unchanged = JSON.stringify(scope) === JSON.stringify(current);
  const rows = agents.data ?? [];
  // A scope names agents by reference, as the resolver does.
  const name = (ref: string) => rows.find((agent) => agent.ref === ref)?.name || ref;
  return (
    <section aria-label="Where it applies" data-slot="connector-scope">
      <SettingsGroupLabel>Where it applies</SettingsGroupLabel>
      <p className="text-xs text-muted-foreground" role="status">
        {change
          ? connectorStatus(connector, change).label
          : connector.enabled
            ? `Enabled for ${scopeWords(current, name).toLowerCase()}`
            : 'Not enabled'}
      </p>
      <SettingsRow
        description="Otherwise it applies only to the agents you choose."
        htmlFor={`${connector.id}-every`}
        inlineControl
        title="Available in every conversation"
      >
        <Switch checked={every} id={`${connector.id}-every`} onCheckedChange={setEvery} />
      </SettingsRow>
      {!every ? (
        <fieldset className="grid gap-1.5 py-2">
          <legend className="mb-1 text-xs text-muted-foreground">Agents</legend>
          {rows.length ? (
            rows.map((agent) => (
              <label className="flex min-w-0 items-center gap-2 text-[0.8125rem]" key={agent.ref}>
                <Checkbox
                  checked={chosen.includes(agent.ref)}
                  onCheckedChange={(on) =>
                    setChosen((list) =>
                      on ? [...list, agent.ref] : list.filter((ref) => ref !== agent.ref),
                    )
                  }
                />
                <span className="min-w-0 truncate">{agent.name || agent.id}</span>
              </label>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              {agents.isPending ? 'Loading agents…' : 'No agents are installed.'}
            </p>
          )}
        </fieldset>
      ) : null}
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        {!connector.enabled || !unchanged ? (
          <Button
            className="h-7 px-2.5 text-xs"
            disabled={busy || (!every && !chosen.length)}
            onClick={() => actions.enable.mutate({ id: connector.id, scope })}
            size="sm"
          >
            {change === 'starting' ? 'Starting…' : connector.enabled ? 'Apply' : 'Enable'}
          </Button>
        ) : null}
        {connector.enabled ? (
          <Button
            className="h-7 px-2.5 text-xs"
            disabled={busy}
            onClick={() => actions.disable.mutate(connector.id)}
            size="sm"
            variant="outline"
          >
            {change === 'turning-off' ? 'Turning off…' : 'Turn off'}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
