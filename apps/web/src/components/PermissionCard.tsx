/**
 * UI component: Permission Card. Renders `PermissionCard` from `PermissionCardProps`.
 */
import type { PermissionRequest, PermissionScope } from '@clio/core';
import './permission.css';

export interface PermissionCardProps {
  request: PermissionRequest;
  /**
   * Callback fired when the user picks a button. The default
   * (fixture-driven) path leaves it undefined; live mode wires it to
   * `client.resolvePermission(...)`.
   */
  onDecide?: (decision: 'approve' | 'deny', scope?: PermissionScope) => void;
}

export function PermissionCard(props: PermissionCardProps) {
  const risk = props.request.risk ?? 'medium';
  const decide = (d: 'approve' | 'deny', scope?: PermissionScope) =>
    props.onDecide?.(d, scope);

  return (
    <div class={'permcard permcard--' + risk} data-testid="permission-card">
      <header class="permcard__head">
        <span class="permcard__badge">permission · {risk} risk</span>
        <span class="permcard__tool">{props.request.tool_name}</span>
      </header>
      <pre class="permcard__input">
        {JSON.stringify(props.request.tool_call?.input ?? {}, null, 2)}
      </pre>
      {props.request.reason && <p class="permcard__reason">{props.request.reason}</p>}
      <div class="permcard__actions">
        <button
          type="button"
          class="btn btn--primary"
          data-testid="permcard-allow-once"
          onClick={() => decide('approve', 'once')}
        >
          Allow once
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          data-testid="permcard-allow-session"
          onClick={() => decide('approve', 'session')}
        >
          For this session
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          data-testid="permcard-allow-tool"
          onClick={() => decide('approve', 'always_tool')}
        >
          Always for this tool
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          data-testid="permcard-allow-server"
          onClick={() => decide('approve', 'always_server')}
        >
          Always on this server
        </button>
        <button
          type="button"
          class="btn btn--danger"
          data-testid="permcard-deny"
          onClick={() => decide('deny')}
        >
          Deny
        </button>
      </div>
    </div>
  );
}
