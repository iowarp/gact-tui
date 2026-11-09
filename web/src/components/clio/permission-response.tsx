import type { PendingInteraction } from '@clio/core/v3';
import { BotIcon, FileCode2Icon, ShieldQuestionIcon, UserRoundIcon } from 'lucide-react';
import { flowTrustRequest } from '@/lib/plugin-review';
import {
  AskBody,
  AskButton,
  AskCard,
  AskCode,
  AskDetails,
  AskError,
  AskOptions,
  AskSection,
  type AskFact,
} from './ask-card';
import { FlowTrustDetails } from './flow-trust-details';
import { pendingInteractionDomId, respondFromControl } from './interaction-control';
import type { ClioPendingInteractionsProps } from './pending-interactions';
import { PermissionOperationDetails, PermissionPaths } from './permission-operation-details';
import { permissionOperationLabel } from './permission-operation-labels';

const SCOPES = [
  { action: 'allow', label: 'Allow once', name: 'Allow once' },
  { action: 'allow_session', label: 'This session', name: 'Allow for this session' },
  { action: 'allow_workspace', label: 'This workspace', name: 'Allow for this workspace' },
  // Offered only on a question asked from a run_code script.
  {
    action: 'allow_script',
    label: 'Rest of this script',
    name: 'Allow for the rest of this script',
  },
];
const KNOWN_ACTIONS = new Set(['deny', ...SCOPES.map((scope) => scope.action)]);

function permissionTitle(interaction: PendingInteraction, toolName: string | undefined) {
  const input = interaction.payload?.tool_call?.input;
  const fields =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const legacy =
    interaction.title === `destructive tool call: ${toolName}` ||
    interaction.title === `tool call: ${toolName}` ||
    interaction.title === `external MCP tool call: ${toolName}`;
  if (!legacy) return interaction.title;
  if (toolName === 'connected_data_connect')
    return typeof fields.label === 'string' && fields.label.trim()
      ? `Connect ${fields.label}`
      : 'Connect source';
  if (toolName === 'connected_data_download') return 'Download source';
  return permissionOperationLabel(toolName ?? '', fields) ?? interaction.title;
}

/** Who asked, when it is not the conversation on screen. */
function askedBy(
  interaction: PendingInteraction,
  ownerLabel: string | undefined,
  show: boolean,
): AskFact[] {
  if (!show) return [];
  return [
    {
      label: 'Asked by',
      icon: <UserRoundIcon />,
      title: ownerLabel ?? `Requested by session ${interaction.owner_session_id}`,
      // Who asked moves into Technical details at a fifth of the window.
      narrow: false,
      value: ownerLabel ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <BotIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate text-accent-foreground">{ownerLabel}</span>
        </span>
      ) : (
        <span className="min-w-0 truncate text-muted-foreground">Session not listed yet</span>
      ),
    },
  ];
}

/** One permission decision: facts, the exact command, then numbered scopes the server offered. */
export function PermissionResponse({
  disabled,
  interaction,
  onOpenScript,
  onResponse,
  ownerLabel,
  responseError,
  showOwner,
}: {
  disabled?: boolean;
  interaction: PendingInteraction;
  onOpenScript?: ClioPendingInteractionsProps['onOpenScript'];
  onResponse: ClioPendingInteractionsProps['onResponse'];
  ownerLabel?: string;
  responseError?: Error;
  showOwner: boolean;
}) {
  // Running a flow from a plugin not trusted yet: the decision is trusting its
  // plugin, which lasts, so it is offered once ("Trust and run") without a duration.
  const flowTrust = flowTrustRequest(interaction);
  const offered = (action: string) => !interaction.actions || interaction.actions.includes(action);
  const scopes = SCOPES.filter(
    (scope) => offered(scope.action) && (!flowTrust || scope.action === 'allow'),
  );
  const toolCall = interaction.payload?.tool_call;
  const toolName = toolCall?.tool_name ?? interaction.source.tool_name;
  const title = flowTrust
    ? `Running flow ${flowTrust.flow}`
    : permissionTitle(interaction, toolName);
  const script = interaction.payload?.script;
  const scriptLines = script ? script.code.replace(/\n$/u, '').split('\n').length : 0;
  const respond = (action: string) => respondFromControl(onResponse(interaction, { action }));
  const owner = askedBy(interaction, ownerLabel, showOwner);
  return (
    <AskCard
      data-interaction-kind="permission"
      icon={ShieldQuestionIcon}
      id={pendingInteractionDomId(interaction.id)}
      kind="permission"
      title={title}
      titleText={title}
    >
      <AskBody>
        {flowTrust ? (
          <AskSection className="mt-1">
            <FlowTrustDetails request={flowTrust} />
          </AskSection>
        ) : (
          <PermissionOperationDetails
            extraFacts={owner}
            interaction={interaction}
            pathsInline={false}
            title={title}
          />
        )}
      </AskBody>
      {script ? (
        // Under a cap the script gives up height first, down to two lines with its fade and
        // footer, so the facts above (the command) stay whole.
        <AskCode
          className="flex min-h-20 shrink-[100] flex-col"
          code={script.code}
          copyLabel="Copy script"
          icon={FileCode2Icon}
          label="Script"
          language="python"
          meta={`Python, ${scriptLines} ${scriptLines === 1 ? 'line' : 'lines'}`}
          name="Script"
          onOpen={onOpenScript ? () => onOpenScript(interaction, script.call_id) : undefined}
          wrapToggle
        />
      ) : null}
      <AskError error={responseError} />
      <AskOptions aria-label="Decision">
        {scopes.map((scope, index) => (
          <AskButton
            aria-label={flowTrust ? 'Trust and run' : scope.name}
            disabled={disabled}
            hint={index === 0 ? 'Enter' : undefined}
            key={scope.action}
            number={index + 1}
            onClick={() => respond(scope.action)}
            primary={index === 0}
          >
            {flowTrust ? 'Trust and run' : scope.label}
          </AskButton>
        ))}
        {(interaction.actions ?? [])
          .filter((action) => !KNOWN_ACTIONS.has(action))
          .map((action) => (
            <AskButton disabled key={action} title={`This client cannot offer "${action}" yet.`}>
              {action}
            </AskButton>
          ))}
        {offered('deny') ? (
          <AskButton disabled={disabled} hint="Escape" onClick={() => respond('deny')}>
            Deny
          </AskButton>
        ) : null}
      </AskOptions>
      {toolName || toolCall?.input !== undefined || interaction.payload?.access?.paths.length ? (
        <AskDetails hint="raw arguments, as the agent sent them">
          <div className="grid gap-1.5">
            {owner.length ? (
              <p
                className="hidden min-w-0 truncate @max-[420px]/ask:block"
                data-slot="ask-details-owner"
                title={owner[0]?.title}
              >
                Asked by{' '}
                <span className="text-foreground/90">
                  {ownerLabel ?? `session ${interaction.owner_session_id}`}
                </span>
              </p>
            ) : null}
            {toolName && !flowTrust ? (
              <p className="min-w-0 truncate" title={toolName}>
                Tool <span className="font-mono text-foreground/90">{toolName}</span>
              </p>
            ) : null}
            {(toolName === 'web_fetch' || toolName === 'web_search') &&
            interaction.payload?.execution?.cwd ? (
              <p className="break-all">Working folder: {interaction.payload.execution.cwd}</p>
            ) : null}
            <PermissionPaths paths={interaction.payload?.access?.paths ?? []} />
            {toolCall?.input === undefined ? null : (
              <AskCode
                className="mt-0 ml-0"
                code={JSON.stringify(toolCall.input, null, 2)}
                copyLabel="Copy arguments"
                label="Arguments"
                language="json"
                name="Arguments"
                previewLines={12}
              />
            )}
          </div>
        </AskDetails>
      ) : null}
    </AskCard>
  );
}
