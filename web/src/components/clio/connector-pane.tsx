import type { Connector, ConnectorNeed } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useConnectorActions, useConnectorChanges } from '@/hooks/use-connectors';
import { connectorStatus, type ConnectorChange } from '@/lib/connector-presentation';
import { DeleteIcon } from '@/lib/icon-vocabulary';
import { ConnectorLogo, ConnectorNeedRows } from './connector-need-rows';
import { draftValues, unfilledRequired, type ConnectorDraft } from '@/lib/connector-draft';
import { DetailPane } from './primitives/detail-pane';
import { IconButton } from './primitives/icon-button';
import { KeyValueGrid } from './primitives/key-value-grid';
import { RowConfirm } from './primitives/row-confirm';
import { StatusIndicator } from './primitives/status-indicator';
import { SettingsGroupLabel } from './settings-row';
import { ph, plural, t } from '@lingui/core/macro';

/**
 * The setup card in the Extensions detail pane (CN4): the logo, the name, the state in
 * words, one row for each need, and enabling it (CN10).
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
            label={t`Remove ${ph({ name: connector.name })}`}
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
            {
              label: t`Source`,
              value: connector.source === 'custom' ? t`Added by you` : t`Catalog`,
            },
            ...(connector.tool_count === null
              ? []
              : [{ label: t`Tools`, value: `${connector.tool_count}` }]),
            ...(connector.plugin
              ? [
                  {
                    label: t`Agent guidance`,
                    value: t`How to work with ${ph({ name: connector.name })}`,
                  },
                ]
              : []),
          ]}
        />
        <SettingsGroupLabel>{t`Setup`}</SettingsGroupLabel>
        {connector.needs.length ? (
          <>
            <ConnectorNeedRows
              disabled={saving}
              draft={draft}
              needs={connector.needs}
              onDraft={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
              onSignIn={(need) => onSignIn(connector, need)}
              onSubmit={save}
              submitLabel={t`Set up ${ph({ name: connector.name })}`}
            />
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
              <Button
                className="h-7 px-2.5 text-xs"
                disabled={!changed || saving}
                onClick={save}
                size="sm"
              >
                {saving ? t`Connecting…` : t({ message: 'Save', context: 'verb' })}
              </Button>
              {changed ? (
                <Button
                  className="h-7 px-2.5 text-xs"
                  disabled={saving}
                  onClick={() => setDraft({})}
                  size="sm"
                  variant="ghost"
                >
                  {t`Discard changes`}
                </Button>
              ) : null}
              {missing.length && !saving ? (
                <span className="text-xs text-muted-foreground">
                  {plural(missing.length, {
                    one: '# required row is empty',
                    other: '# required rows are empty',
                  })}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="leading-5 text-muted-foreground">{t`It needs nothing from you.`}</p>
        )}
        <ConnectorEnableControls change={change} connector={connector} />
      </div>
    </DetailPane>
  );
}

/**
 * Enabling installs and readies the connector (CN10 *Amended*). It reaches a
 * conversation only when the person adds its plugin there, from the conversation's
 * plugin picker, so no conversation pays for its tools until it is wanted.
 */
function ConnectorEnableControls({
  connector,
  change,
}: {
  connector: Connector;
  change: ConnectorChange | undefined;
}) {
  const actions = useConnectorActions();
  // Pending here or from another place this connector appears: one state, in words (CN3).
  const busy = Boolean(change) || actions.enable.isPending || actions.disable.isPending;
  return (
    <section aria-label={t`In conversations`} data-slot="connector-enable">
      <SettingsGroupLabel>{t`In conversations`}</SettingsGroupLabel>
      <p className="text-xs leading-5 text-muted-foreground" role="status">
        {change
          ? connectorStatus(connector, change).label
          : connector.enabled
            ? t`Enabled. Add ${ph({ name: connector.name })} to a conversation from its plugins; other conversations don’t carry its tools.`
            : t`Enable ${ph({ name: connector.name })} to add it to the conversations that need it.`}
      </p>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        {!connector.enabled ? (
          <Button
            className="h-7 px-2.5 text-xs"
            disabled={busy}
            onClick={() => actions.enable.mutate(connector.id)}
            size="sm"
          >
            {change === 'starting' ? t`Starting…` : t`Enable`}
          </Button>
        ) : (
          <Button
            className="h-7 px-2.5 text-xs"
            disabled={busy}
            onClick={() => actions.disable.mutate(connector.id)}
            size="sm"
            variant="outline"
          >
            {change === 'turning-off' ? t`Turning off…` : t`Turn off`}
          </Button>
        )}
      </div>
    </section>
  );
}
