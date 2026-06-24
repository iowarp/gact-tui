export interface AgentBlueprintSummary {
  id: string;
  name?: string;
  description?: string;
  kind?: string;
  scope?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

export interface ExpertPackSummary {
  id: string;
  name?: string;
  description?: string;
  kind?: string;
  scope?: string;
  runtime_scope?: string;
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  raw: Record<string, unknown>;
}
