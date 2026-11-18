import { t } from '@lingui/core/macro';
import { TransportError, type A2UISurfaceOwner, type A2uiActionReply } from '@clio/core/v3';

/** The HS1 and HS3 reasons a plugin's server's view is refused or a tab is empty. */
export function serverSurfaceReason(reason: string): string | undefined {
  switch (reason) {
    case 'a2ui_version_unsupported':
      return t`It uses an A2UI version this workspace does not support.`;
    case 'a2ui_payload_invalid':
      return t`Its view data is malformed.`;
    case 'a2ui_catalog_unknown':
      return t`It uses a component catalog that is not installed.`;
    case 'a2ui_catalog_not_producible':
      return t`Its plugin does not declare the component catalog it uses.`;
    case 'a2ui_surface_owner_conflict':
      return t`It tried to change a view that another server owns.`;
    case 'a2ui_validation_failed':
      return t`Its view did not pass validation.`;
    case 'plugin_tab_server_unavailable':
      return t`Its server is not running in this conversation.`;
    case 'plugin_tab_resource_failed':
      return t`Its server could not provide the tab's content.`;
    default:
      return undefined;
  }
}

export interface ServerActionFailure {
  message: string;
  /** The owning server is gone: the view stays, read-only. */
  serverGone: boolean;
}

/** Words an HS2 refusal; a code it doesn't know keeps the service's own message. */
export function serverActionFailure(error: unknown, server: string): ServerActionFailure {
  const code = error instanceof TransportError ? error.code : undefined;
  switch (code) {
    case 'a2ui_server_tool_not_app_visible':
      return { message: t`${server} does not let this view run that action.`, serverGone: false };
    case 'a2ui_server_unavailable':
      return {
        message: t`${server} is not running in this conversation, so this view is read-only.`,
        serverGone: true,
      };
    case 'a2ui_surface_not_owned':
      return {
        message: t`This view no longer belongs to ${server}, so the action was not sent.`,
        serverGone: false,
      };
    default: {
      const reason = code ? serverSurfaceReason(code) : undefined;
      if (reason) return { message: t`${server} sent a view that was refused. ${reason}`, serverGone: false };
      return {
        message: error instanceof Error ? error.message : t`The request could not be completed.`,
        serverGone: false,
      };
    }
  }
}

export type ServerActionResult =
  | { kind: 'error'; message: string }
  | { kind: 'running'; message: string }
  | { kind: 'quiet'; message: string };

/** What an HS2 reply tells the person; an applied change shows in the view itself. */
export function serverActionResult(
  reply: A2uiActionReply | void,
  server: string,
): ServerActionResult | undefined {
  if (!reply || reply.destination !== 'server') return undefined;
  switch (reply.outcome) {
    case 'tool_error': {
      const text = reply.error_text?.trim();
      return {
        kind: 'error',
        message: text
          ? t`${server} reported a problem: ${text}`
          : t`${server} reported a problem with this action.`,
      };
    }
    case 'task_pending':
      return { kind: 'running', message: t`${server} is still working on it` };
    case 'no_update':
      return { kind: 'quiet', message: t`${server} finished without changing this view` };
    default:
      return undefined;
  }
}

export function isServerOwned(
  owner: A2UISurfaceOwner | undefined,
): owner is A2UISurfaceOwner & { kind: 'server' } {
  return owner?.kind === 'server' && Boolean(owner.server);
}
