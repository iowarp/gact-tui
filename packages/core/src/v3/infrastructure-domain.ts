export type InfrastructureDependencyPhase =
  | 'provision'
  | 'launch'
  | 'connect'
  | 'retry'
  | 'unknown';

export type InfrastructureDependencyState = 'running' | 'retrying' | 'ready' | 'failed' | 'unknown';

/** One session-scoped projection of a workspace-owned external dependency. */
export interface InfrastructureDependency {
  id: string;
  session_id: string;
  category: string;
  namespace: string;
  title: string;
  phase: InfrastructureDependencyPhase;
  state: InfrastructureDependencyState;
  attempt: number;
  max_attempts: number;
  reason?: string;
  retry_in_ms?: number;
  tool_count?: number;
  /** Reducer-derived: this client observed the dependency doing work before completion. */
  observed_active: boolean;
}
