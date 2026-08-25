/** Canonical identity retained by a session even when its blueprint is not catalog-installed. */
export interface AgentBlueprintReference {
  id: string;
  display_name: string;
  version?: string;
  scope?: string;
  enabled?: boolean;
}
