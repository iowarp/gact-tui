import type { PermissionLedgerItem } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { KeyRoundIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfoTip } from './info-tip';
import { permissionOperationLabel } from './permission-operation-labels';
import { ItemList, ItemRow } from './primitives/item-row';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { RULE_COLUMNS } from './settings-access-rule-model';
import { GroupEmptyLine, GroupErrorLine } from './settings-permissions-lines';
import { StateView } from './primitives/state-view';
import { SettingsGroupLabel } from './settings-row';

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Reason codes the service records, in words; an unknown code is sentence-cased. */
const REASONS: Record<string, string> = {
  policy_allow: 'Allowed by an access rule',
  policy_deny: 'Blocked by an access rule',
  policy_ask: 'An access rule asked',
  user_approved: 'You allowed it',
  user_denied: 'You blocked it',
  user_requested_session_delete: 'You deleted the conversation',
  permission_request_cancelled: 'Request cancelled',
  permission_request_expired: 'Request expired',
};

function reasonText(reason: string | undefined): string | undefined {
  const value = reason?.trim();
  if (!value) return undefined;
  if (REASONS[value]) return REASONS[value];
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/u.test(value) ? capitalize(value.replaceAll('_', ' ')) : value;
}

const inputRecord = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};

function requestStatus(permission: PermissionLedgerItem): { label: string; tone: StatusTone } {
  const status = permission.status || 'pending';
  if (status === 'pending') return { label: 'Needs you', tone: 'waiting' };
  if (permission.action === 'deny' || status === 'denied')
    return { label: 'Blocked', tone: 'error' };
  if (permission.action?.startsWith('allow') || status === 'approved' || status === 'allowed') {
    return { label: 'Allowed', tone: 'success' };
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
          Requests
          <InfoTip label="About requests">
            Decisions the service reported on this connection. The agent cannot approve its own
            protected actions.
          </InfoTip>
        </span>
      </SettingsGroupLabel>
      <ItemList label="Requests">
        {rows.map((permission, index) => {
          const status = requestStatus(permission);
          const operation = permissionOperationLabel(
            permission.tool_name,
            inputRecord(permission.input),
          );
          const title = capitalize(permission.summary?.trim() || operation || 'Protected action');
          const meta = reasonText(permission.reason);
          return (
            <ItemRow
              {...RULE_COLUMNS}
              actions={
                <InfoTip label={`Technical details for request ${index + 1}`}>
                  <span className="grid gap-0.5">
                    <span className="font-mono">{permission.tool_name}</span>
                    {operation && operation !== title ? <span>{operation}</span> : null}
                    {permission.risk ? <span>{capitalize(permission.risk)} risk</span> : null}
                    <span className="font-mono">Session {permission.session_id}</span>
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
          <StateView kind="loading" size="row" title="Loading requests…" />
        ) : null}
        {permissions.data?.length === 0 ? (
          <GroupEmptyLine>No pending or recorded requests on this connection.</GroupEmptyLine>
        ) : null}
        {permissions.isError ? (
          <GroupErrorLine
            onRetry={() => void permissions.refetch()}
            retrying={permissions.isFetching}
          >
            Couldn’t load the requests.
          </GroupErrorLine>
        ) : null}
      </ItemList>
    </section>
  );
}
