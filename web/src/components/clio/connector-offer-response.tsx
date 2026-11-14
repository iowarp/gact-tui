import { connectorSetupPayload, type PendingInteraction } from '@clio/core/v3';
import { ChevronRightIcon, PlugIcon, PuzzleIcon } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useConnector, useSessionConnector } from '@/hooks/use-connectors';
import { usePluginCatalog } from '@/hooks/use-session-agent';
import { conversationAnswer, unfilledRequired, type ConnectorDraft } from '@/lib/connector-draft';
import { humanizePluginId } from '@/lib/plugin-presentation';
import { offerContentsLine } from '@/lib/plugin-offer-contents';
import { cn } from '@/lib/utils';
import { AskBody, AskButton, AskCard, AskError, AskOptions, AskSection } from './ask-card';
import { ConnectorLogo, ConnectorNeedRows } from './connector-need-rows';
import { pendingInteractionDomId, respondFromControl } from './interaction-control';
import type { ClioPendingInteractionsProps } from './pending-interactions';
import { StatusIndicator } from './primitives/status-indicator';

const PluginExplorer = lazy(() =>
  import('./plugin-explorer').then((module) => ({ default: module.PluginExplorer })),
);

/**
 * The agent offers to add a connector or a plugin to this conversation (discovery).
 * Four rows, so a first-time person can tell what it is, why the agent asks and what
 * Add changes: the logo, "Add <name> to this conversation?" and its state in words;
 * what it is (its own description, one line, the whole on expand); why (the agent's
 * reason, one line); Add, Not now, what it brings in words ("Brings 1 skill and 1 MCP
 * server (13 tools) to this conversation"), a quiet "View plugin" that opens the
 * plugin explorer over the conversation (the card stays), and "Settings (n)" when the
 * connector has optional settings. Required needs show only when there are some. Add
 * puts it in this conversation only, turning a connector on first when it is off, and
 * the agent's request continues; Not now refuses.
 */
export function ConnectorOfferResponse({
  disabled,
  interaction,
  onResponse,
  responseError,
}: {
  disabled?: boolean;
  interaction: PendingInteraction;
  onResponse: ClioPendingInteractionsProps['onResponse'];
  responseError?: Error;
}) {
  const payload = connectorSetupPayload(interaction.payload);
  const plugin = payload?.intent === 'add_plugin';
  const id = plugin ? '' : (payload?.connector_id ?? '');
  // The rows as this conversation sees them: its own values over the defaults (CV-D5).
  const { connector: everywhereRow } = useConnector(id || undefined);
  const { connector: conversationRow } = useSessionConnector(
    id || undefined,
    interaction.owner_session_id || undefined,
  );
  const connector = conversationRow ?? everywhereRow;
  // What the plugin brings, from the plugin row Extensions lists (`GET /v1/plugins`).
  const catalog = usePluginCatalog();
  const pluginRef = plugin ? (payload?.plugin_ref ?? '') : (connector?.plugin_ref ?? '');
  const entry = pluginRef ? catalog.data?.plugins.find((row) => row.ref === pluginRef) : undefined;
  const [exploring, setExploring] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<ConnectorDraft>({});
  const [showSettings, setShowSettings] = useState(false);
  const rows = (payload?.missing ?? []).map(
    (need) => connector?.needs.find((row) => row.key === need.key) ?? need,
  );
  const name = plugin
    ? (entry?.connector?.name ?? humanizePluginId(payload?.plugin_id || 'a plugin'))
    : (connector?.name ?? payload?.connector_name ?? (id || 'a connector'));
  // What it is: a plugin's own description (the row's whole text over the payload's
  // summary); a connector's own description, not its guidance plugin's.
  const description = plugin
    ? entry?.description || payload?.description || ''
    : payload?.description || connector?.description || '';
  const contents = offerContentsLine(
    entry,
    plugin ? null : { id, tool_count: connector?.tool_count ?? null },
  );
  const on = connector?.enabled ?? payload?.connector_enabled ?? false;
  const unfilled = unfilledRequired(rows, draft);
  const required = rows.filter((need) => need.required);
  const optional = rows.filter((need) => !need.required);
  const settingsId = `${pendingInteractionDomId(interaction.id)}-settings`;
  const offered = (action: string) => !interaction.actions || interaction.actions.includes(action);
  const add = () => {
    if (disabled || unfilled.length) return;
    const { values, save_as_default } = conversationAnswer(rows, draft, saveAsDefault);
    respondFromControl(
      onResponse(interaction, { action: 'submit', values, metadata: { save_as_default } }),
    );
  };
  const needProps = {
    disabled,
    draft,
    onDraft: (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value })),
    onSignIn: () => undefined,
    onSaveAsDefault: (key: string, save: boolean) =>
      setSaveAsDefault((current) => ({ ...current, [key]: save })),
    onSubmit: add,
    saveAsDefault,
    submitLabel: `Add ${name}`,
  };
  const marketplace = payload?.plugin_ref?.split('/')[0];
  const state = plugin
    ? marketplace
      ? `Plugin from ${marketplace}`
      : 'Plugin'
    : on
      ? 'Enabled'
      : 'Not enabled (Add turns it on)';
  const addTip = [
    plugin || on ? '' : `Adding turns ${name} on.`,
    payload?.asks_sign_in ? 'It asks for a sign-in the first time the agent uses it.' : '',
    unfilled.length ? 'Fill the required rows first.' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const title = `Add ${name} to this conversation?`;
  return (
    <>
      <AskCard
        data-connector={id || undefined}
        data-plugin={plugin ? (payload?.plugin_id ?? name) : undefined}
        data-interaction-kind="connector_setup"
        data-intent={payload?.intent ?? 'enable'}
        headerActions={
          <span
            className="flex max-w-[45%] shrink-0 items-center gap-1 pl-1 text-right text-xs text-muted-foreground"
            data-slot="connector-offer-state"
          >
            {plugin ? (
              state
            ) : (
              <StatusIndicator
                label={on ? 'Enabled' : 'Not enabled'}
                tone={on ? 'success' : 'inactive'}
              />
            )}
            {/* In a narrow card the title keeps the room; Add's tooltip says it too. */}
            {!plugin && !on ? (
              <span className="@max-[420px]/ask:hidden">(Add turns it on)</span>
            ) : null}
          </span>
        }
        icon={plugin ? PuzzleIcon : PlugIcon}
        id={pendingInteractionDomId(interaction.id)}
        kind="question"
        leading={
          plugin ? undefined : (
            <ConnectorLogo
              className="size-4 text-[8px]"
              connector={connector ?? { id, name, logo_url: null }}
            />
          )
        }
        spokenDetail={`${state}. ${description} ${payload?.reason ?? ''} ${contents}. ${addTip}`.trim()}
        title={title}
        titleText={title}
        wrapTitle
      >
        {description || payload?.reason || required.length || !payload ? (
          <AskBody>
            <AskSection className="mt-1.5 grid gap-1">
              {description ? (
                <OneLine
                  className="text-muted-foreground"
                  slot="connector-offer-description"
                  text={description}
                />
              ) : null}
              {payload?.reason ? (
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground">Why</span>
                  <OneLine slot="connector-offer-reason" text={payload.reason} />
                </div>
              ) : null}
              {!payload ? <p role="alert">This offer can’t be read by this version.</p> : null}
              {required.length ? <ConnectorNeedRows {...needProps} needs={required} /> : null}
            </AskSection>
          </AskBody>
        ) : null}
        <AskError error={responseError} />
        <AskOptions aria-label="Decision" className="mt-2">
          {offered('submit') ? (
            <AskButton
              disabled={disabled || !payload || unfilled.length > 0}
              hint={unfilled.length ? undefined : 'Enter'}
              number={1}
              onClick={add}
              primary
              title={addTip || undefined}
            >
              Add
            </AskButton>
          ) : null}
          {offered('decline') ? (
            <AskButton
              disabled={disabled}
              hint="Escape"
              onClick={() => respondFromControl(onResponse(interaction, { action: 'decline' }))}
            >
              Not now
            </AskButton>
          ) : null}
          <div
            className="flex min-w-0 flex-1 basis-48 items-center gap-1.5"
            data-slot="connector-offer-brings"
          >
            <span
              className="min-w-0 shrink truncate text-xs text-muted-foreground"
              data-slot="connector-offer-contents"
              title={contents}
            >
              {contents}
            </span>
            {entry ? (
              <button
                aria-haspopup="dialog"
                className="flex h-7 w-fit shrink-0 items-center rounded-[4px] px-1 text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                data-slot="connector-offer-view-plugin"
                onClick={() => setExploring(true)}
                type="button"
              >
                View plugin
              </button>
            ) : null}
            {optional.length ? (
              <button
                aria-controls={settingsId}
                aria-expanded={showSettings}
                className="flex h-7 w-fit items-center gap-1 rounded-[4px] px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                data-slot="connector-offer-settings"
                onClick={() => setShowSettings((open) => !open)}
                type="button"
              >
                <ChevronRightIcon
                  aria-hidden="true"
                  className={cn('size-3.5 transition-transform', showSettings && 'rotate-90')}
                />
                Settings ({optional.length})
              </button>
            ) : null}
          </div>
        </AskOptions>
        {optional.length && showSettings ? (
          <AskSection className="max-h-64 overflow-y-auto" id={settingsId}>
            <ConnectorNeedRows {...needProps} needs={optional} />
          </AskSection>
        ) : null}
      </AskCard>
      {exploring && entry ? (
        // Outside the card, and its keys stop here: Escape closes the explorer and never
        // answers the offer, which stays for Add once the person has looked.
        <div className="contents" onKeyDown={(event) => event.stopPropagation()}>
          <Suspense fallback={null}>
            <PluginExplorer onClose={() => setExploring(false)} reference={entry.ref} />
          </Suspense>
        </div>
      ) : null}
    </>
  );
}

/** One line of the card (what it is, or why the agent asks); the whole of it on expand. */
function OneLine({ text, slot, className }: { text: string; slot: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      aria-expanded={open}
      className={cn(
        'min-w-0 rounded-[4px] text-left leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        open ? 'whitespace-normal [overflow-wrap:anywhere]' : 'truncate',
        className,
      )}
      data-slot={slot}
      onClick={() => setOpen((value) => !value)}
      title={open ? undefined : text}
      type="button"
    >
      {text}
    </button>
  );
}
