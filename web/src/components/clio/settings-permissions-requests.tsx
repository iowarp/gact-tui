import type { PermissionLedgerItem } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { KeyRoundIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfoTip } from './info-tip';
import { permissionOperationLabel } from './permission-operation-labels';
import { permissionReasonText, permissionSummaryText } from './permission-request-text';
import { ItemList, ItemRow } from './primitives/item-row';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { RULE_COLUMNS } from './settings-access-rule-model';
import { GroupEmptyLine, GroupErrorLine } from './settings-permissions-lines';
import { StateView } from './primitives/state-view';
import { SettingsGroupLabel } from './settings-row';
import { t, ph } from '@lingui/core/macro';

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** The risk the service assessed, as a label; an unrecognized level reads as reported. */
function riskLabel(risk: string): string {
  const known: Record<string, string> = {
    low: t`Low risk`,
    medium: t`Medium risk`,
    high: t`High risk`,
    critical: t`Critical risk`,
  };
  return known[risk.toLowerCase()] ?? t`${ph({ risk: capitalize(risk) })} risk`;
}

const inputRecord = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};

function requestStatus(permission: PermissionLedgerItem): { label: string; tone: StatusTone } {
  const status = permission.status || 'pending';
  if (status === 'pending') return { label: t`Needs you`, tone: 'waiting' };
  if (permission.action === 'deny' || status === 'denied')
    return { label: t`Blocked`, tone: 'error' };
  if (permission.action?.startsWith('allow') || status === 'approved' || status === 'allowed') {
    return { label: t`Allowed`, tone: 'success' };
  }
  return { label: capitalize(status), tone: 'idle' };
}

/** Requests the service reported: pending decisions first, then the recorded ones. */
export function PermissionRequests() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const permissions = useQuery({
    queryKey: queryKeys.key('permissions', settings.endpoint),
    queryFn: ({ signal }) => repository.permissions(signal),
  });
  const rows = [...(permissions.data ?? [])].sort(
    (a, b) =>
      Number((b.status || 'pending') === 'pending') - Number((a.status || 'pending') === 'pending'),
  );
  return (
    <section aria-labelledby="permission-requests-heading">
      <SettingsGroupLabel>
        <span className="flex items-center gap-1.5" id="permission-requests-heading">
          {t`Requests`}
          <InfoTip label={t`About requests`}>
            {t`Decisions the service reported on this connection. The agent cannot approve its own protected actions.`}
          </InfoTip>
        </span>
      </SettingsGroupLabel>
      <ItemList label={t`Requests`}>
        {rows.map((permission, index) => {
          const status = requestStatus(permission);
          const operation = permissionOperationLabel(
            permission.tool_name,
            inputRecord(permission.input),
          );
          const summary = permission.summary?.trim();
          const title = summary
            ? permissionSummaryText(summary)
            : capitalize(operation || t`Protected action`);
          const meta = permissionReasonText(permission.reason);
          return (
            <ItemRow
              {...RULE_COLUMNS}
              actions={
                <InfoTip label={t`Technical details for request ${ph({ number: index + 1 })}`}>
                  <span className="grid gap-0.5">
                    <span className="font-mono">{permission.tool_name}</span>
                    {operation && operation !== title ? <span>{operation}</span> : null}
                    {permission.risk ? <span>{riskLabel(permission.risk)}</span> : null}
                    <span className="font-mono">{t`Session ${ph({ session_id: permission.session_id })}`}</span>
                  </span>
                </InfoTip>
              }
              icon={<KeyRoundIcon />}
              key={permission.id}
              meta={meta ? <span title={meta}>{meta}</span> : undefined}
              status={<StatusIndicator label={status.label} tone={status.tone} />}
              title={<span title={title}>{title}</span>}
            />
          );
        })}
        {permissions.isPending ? (
          <StateView kind="loading" size="row" title={t`Loading requests…`} />
        ) : null}
        {permissions.data?.length === 0 ? (
          <GroupEmptyLine>{t`No pending or recorded requests on this connection.`}</GroupEmptyLine>
        ) : null}
        {permissions.isError ? (
          <GroupErrorLine
            onRetry={() => void permissions.refetch()}
            retrying={permissions.isFetching}
          >
            {t`Couldn’t load the requests.`}
          </GroupErrorLine>
        ) : null}
      </ItemList>
    </section>
  );
}
