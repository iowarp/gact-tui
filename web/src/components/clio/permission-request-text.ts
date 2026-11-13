import { t, ph } from '@lingui/core/macro';
import { SESSION_APPROVAL_OPTIONS } from './session-behavior-options';

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** The approval posture the service names in a summary, as the composer labels it. */
function postureLabel(posture: string): string {
  if (posture === 'spotter-watcher') return t`SPOTTER review`;
  return SESSION_APPROVAL_OPTIONS.find((option) => option.value === posture)?.label ?? posture;
}

/** Reason codes the service records, in words. */
function knownReason(code: string): string | undefined {
  switch (code) {
    case 'policy_allow':
      return t`Allowed by an access rule`;
    case 'policy_deny':
      return t`Blocked by an access rule`;
    case 'policy_ask':
      return t`An access rule asked`;
    case 'user_approved':
      return t`You allowed it`;
    case 'user_denied':
      return t`You blocked it`;
    case 'user_requested_session_delete':
      return t`You deleted the conversation`;
    case 'permission_request_cancelled':
      return t`Request cancelled`;
    case 'permission_request_expired':
    case 'permission_request_timeout':
      return t`Request expired`;
    case 'approval_mode_bypass':
      return t`Allowed by approval mode: ${ph({ mode: postureLabel('bypass') })}`;
    case 'approval_mode_auto_edits':
      return t`Allowed by approval mode: ${ph({ mode: postureLabel('auto-edits') })}`;
    case 'approval_profile_spotter_watcher_containment':
      return t`Allowed by approval mode: ${ph({ mode: postureLabel('spotter-watcher') })}`;
    case 'tool_default_allow':
      return t`Allowed by the tool’s default permission`;
    case 'tool_default_deny':
      return t`Blocked by the tool’s default permission`;
    case 'hook_deny':
      return t`Blocked by a hook`;
    case 'run_code_script_grant':
      return t`Covered by its script’s approval`;
    default:
      return undefined;
  }
}

/** A recorded reason in words; an unknown code is sentence-cased, other text reads as reported. */
export function permissionReasonText(reason: string | undefined): string | undefined {
  const value = reason?.trim();
  if (!value) return undefined;
  const known = knownReason(value);
  if (known) return known;
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/u.test(value) ? capitalize(value.replaceAll('_', ' ')) : value;
}

const SUMMARY = /^(destructive tool|external MCP tool) (['"])(.+)\2 (.+)$/iu;

/**
 * The service's English decision summary ("destructive tool 'x' allowed by …"), in words.
 * A summary in another shape reads as reported.
 */
export function permissionSummaryText(summary: string): string {
  const match = SUMMARY.exec(summary.trim());
  if (!match) return capitalize(summary);
  const [, subject = '', , name = '', verdict = ''] = match;
  const external = subject.toLowerCase().startsWith('external');
  const posture = /^allowed by approval posture=(['"])(.+)\1$/u.exec(verdict)?.[2];
  if (posture) {
    const mode = postureLabel(posture);
    return external
      ? t`MCP tool ${ph({ name })} allowed by approval mode: ${ph({ mode })}`
      : t`Tool ${ph({ name })} allowed by approval mode: ${ph({ mode })}`;
  }
  switch (verdict) {
    case 'allowed by permission policy':
      return external
        ? t`MCP tool ${ph({ name })} allowed by an access rule`
        : t`Tool ${ph({ name })} allowed by an access rule`;
    case 'allowed by its default permission':
      return external
        ? t`MCP tool ${ph({ name })} allowed by its default permission`
        : t`Tool ${ph({ name })} allowed by its default permission`;
    case 'blocked by permission policy':
      return external
        ? t`MCP tool ${ph({ name })} blocked by an access rule`
        : t`Tool ${ph({ name })} blocked by an access rule`;
    case 'blocked by its default permission':
      return external
        ? t`MCP tool ${ph({ name })} blocked by its default permission`
        : t`Tool ${ph({ name })} blocked by its default permission`;
    case 'blocked by a PreToolUse hook':
      return external
        ? t`MCP tool ${ph({ name })} blocked by a hook`
        : t`Tool ${ph({ name })} blocked by a hook`;
    case "covered by its script's approval":
      return external
        ? t`MCP tool ${ph({ name })} covered by its script’s approval`
        : t`Tool ${ph({ name })} covered by its script’s approval`;
    default:
      return capitalize(summary);
  }
}
