import { useAttentionDraft } from './attention-drafts';
import type { PendingInteraction } from '@clio/core/v3';
import { ShieldQuestionIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import type { ClioPendingInteractionsProps } from './pending-interactions';
import { pendingInteractionDomId, respondFromControl } from './interaction-control';
import { OwnerAttribution, ResponseErrorNotice } from './pending-interaction-notices';
import { TechnicalDetails } from './technical-details';
import { PermissionOperationDetails } from './permission-operation-details';

const SCOPES = [
  { action: 'allow', label: 'Once', button: 'Allow once' },
  { action: 'allow_session', label: 'This session', button: 'Allow for session' },
  { action: 'allow_workspace', label: 'This workspace', button: 'Allow for workspace' },
];
const KNOWN_ACTIONS = new Set(['deny', ...SCOPES.map((scope) => scope.action)]);

/** One permission decision with explicit duration and only server-offered actions. */
export function PermissionResponse({
  disabled,
  interaction,
  onResponse,
  ownerLabel,
  responseError,
  showOwner,
}: {
  disabled?: boolean;
  interaction: PendingInteraction;
  onResponse: ClioPendingInteractionsProps['onResponse'];
  ownerLabel?: string;
  responseError?: Error;
  showOwner: boolean;
}) {
  const scopes = SCOPES.filter(
    (scope) => !interaction.actions || interaction.actions.includes(scope.action),
  );
  const [scopeAction, setScopeAction] = useAttentionDraft(`${interaction.id}:scope`, 'allow');
  const scope = scopes.find((scope) => scope.action === scopeAction) ?? scopes[0];
  const toolCall = interaction.payload?.tool_call;
  const toolName = toolCall?.tool_name ?? interaction.source.tool_name;
  return (
    <section
      className="min-w-0 px-3 pb-3"
      data-interaction-kind="permission"
      id={pendingInteractionDomId(interaction.id)}
      tabIndex={-1}
    >
      <div className="mb-3 flex items-start gap-2.5">
        <ShieldQuestionIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0">
          <p
            className="line-clamp-3 text-sm font-medium"
            data-slot="pending-interaction-title"
            title={interaction.title}
          >
            {interaction.title}
          </p>
          <OwnerAttribution interaction={interaction} ownerLabel={ownerLabel} show={showOwner} />
        </div>
      </div>
      <PermissionOperationDetails interaction={interaction} />
      {toolName || toolCall?.input !== undefined ? (
        <TechnicalDetails className="mt-3 text-xs text-muted-foreground" title="Technical details">
          {toolName ? <p className="font-mono">{toolName}</p> : null}
          {toolCall?.input === undefined ? null : (
            <CodeBlock
              className="mt-2 max-h-40"
              code={JSON.stringify(toolCall.input, null, 2)}
              language="json"
            >
              <CodeBlockCopyButton aria-label="Copy protected action details" />
            </CodeBlock>
          )}
        </TechnicalDetails>
      ) : null}
      <ResponseErrorNotice error={responseError} />
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {!interaction.actions || interaction.actions.includes('deny') ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => respondFromControl(onResponse(interaction, { action: 'deny' }))}
          >
            Deny
          </Button>
        ) : null}
        {scope ? (
          <>
            {scopes.length > 1 ? (
              <Select value={scope.action} onValueChange={setScopeAction} disabled={disabled}>
                <SelectTrigger size="sm" aria-label="Permission duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map((scope) => (
                    <SelectItem key={scope.action} value={scope.action}>
                      {scope.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs text-muted-foreground">{scope.label}</span>
            )}
            <Button
              size="sm"
              disabled={disabled}
              aria-label={scope.button}
              onClick={() => respondFromControl(onResponse(interaction, { action: scope.action }))}
            >
              Allow
            </Button>
          </>
        ) : null}
        {(interaction.actions ?? [])
          .filter((action) => !KNOWN_ACTIONS.has(action))
          .map((action) => (
            <Button
              key={action}
              size="sm"
              variant="outline"
              disabled
              title={`This client cannot offer "${action}" yet.`}
            >
              {action}
            </Button>
          ))}
      </div>
    </section>
  );
}
