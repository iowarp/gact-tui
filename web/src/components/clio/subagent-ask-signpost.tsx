import type { PendingInteraction } from '@clio/core/v3';
import { MessageSquareShareIcon } from 'lucide-react';
import { AskButton, AskCard, AskOptions, AskSection, type AskKind } from './ask-card';
import { OwnerAttribution } from './pending-interaction-notices';
import { t } from '@lingui/core/macro';

function signpostKind(interaction: PendingInteraction): AskKind {
  if (interaction.kind === 'permission') return 'permission';
  if (interaction.source.tool_name === 'plan_exit') return 'plan';
  return 'question';
}

/**
 * A subagent's ask, seen from the conversation that started it. The ask is answered in the
 * subagent's own conversation; here it is only signposted: what it asks, who asks, and the way
 * there.
 */
export function SubagentAskSignpost({
  interaction,
  ownerLabel,
  onOpen,
}: {
  interaction: PendingInteraction;
  ownerLabel: string;
  onOpen: (ownerSessionId: string) => void;
}) {
  return (
    <AskCard
      data-interaction-kind={interaction.kind}
      data-slot="subagent-ask-signpost"
      icon={MessageSquareShareIcon}
      kind={signpostKind(interaction)}
      owner={<OwnerAttribution interaction={interaction} ownerLabel={ownerLabel} show />}
      title={interaction.title || t`A subagent is waiting for you`}
      wrapTitle
    >
      <AskSection className="mt-1 text-meta text-muted-foreground">
        {t`It is answered in that conversation.`}
      </AskSection>
      <AskOptions className="mt-2">
        <AskButton
          // i18n-ignore: key name
          hint="Enter"
          onClick={() => onOpen(interaction.owner_session_id)}
          primary
        >
          {t`Open conversation`}
        </AskButton>
      </AskOptions>
    </AskCard>
  );
}
