/**
 * Discovery surface support: Prompt Scope logic. Key export `PromptScopeContext`.
 */
export interface PromptScopeContext {
  sessionId?: string;
  workspaceId?: string;
}

export function scopeRequest(context?: PromptScopeContext) {
  return {
    ...(context?.sessionId ? { session_id: context.sessionId } : {}),
    ...(context?.workspaceId ? { workspace_id: context.workspaceId } : {}),
  };
}

export function scopedWriteBody(
  scope: 'global' | 'workspace' | 'session',
  text: string,
  context?: PromptScopeContext,
) {
  return {
    text,
    scope,
    ...(scope === 'session' && context?.sessionId
      ? { session_id: context.sessionId }
      : {}),
    ...((scope === 'session' || scope === 'workspace') && context?.workspaceId
      ? { workspace_id: context.workspaceId }
      : {}),
  };
}
