import type { PermissionRequest } from '@clio/core';
import './permission.css';

export interface PermissionCardProps {
  request: PermissionRequest;
}

export function PermissionCard(props: PermissionCardProps) {
  const risk = props.request.risk ?? 'medium';
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
        <button type="button" class="btn btn--primary">Allow once</button>
        <button type="button" class="btn btn--secondary">For this session</button>
        <button type="button" class="btn btn--secondary">Always for this tool</button>
        <button type="button" class="btn btn--secondary">Always on this server</button>
        <button type="button" class="btn btn--danger">Deny</button>
      </div>
    </div>
  );
}
