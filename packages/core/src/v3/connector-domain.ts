import { z } from 'zod';
import { forwardCompatibleEnum, optionalWireString } from './schema-utils.js';

/**
 * Connectors (`GET /v1/connectors`): what a person enables. Each one says what it
 * needs, in one of four kinds, and has one state for the person asking.
 *
 * A secret need never carries its value back: `value` is null and `has_value`
 * says whether one is stored.
 */
export const connectorNeedKindSchema = forwardCompatibleEnum([
  'address',
  'sign-in',
  'secret',
  'value',
]);
export type ConnectorNeedKind = z.infer<typeof connectorNeedKindSchema>;

const wireText = z
  .string()
  .nullish()
  .transform((value) => value ?? '');

export const connectorNeedSchema = z
  .object({
    key: z.string(),
    kind: connectorNeedKindSchema,
    label: wireText,
    help: wireText,
    required: z.boolean().default(false),
    agent_settable: z.boolean().default(false),
    /** A heading the card shows this need under, with the others of the same group. */
    group: z
      .string()
      .nullish()
      .transform((value) => value ?? ''),
    default: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    value: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    has_value: z.boolean().default(false),
    /**
     * Read for one conversation (`?session_id=`): the person's default for an address or
     * value need, and whether this conversation set its own (`value` is then its own).
     */
    default_value: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    conversation: z.boolean().default(false),
    /** A value chosen from a list: the card shows a picker. Empty means free text. */
    options: z
      .array(z.string())
      .nullish()
      .transform((value) => value ?? []),
  })
  .passthrough()
  // A secret's value is never held on the client, whatever a server sends.
  .transform((need) => (need.kind === 'secret' ? { ...need, value: null } : need));
export type ConnectorNeed = z.infer<typeof connectorNeedSchema>;

export const connectorStatusSchema = forwardCompatibleEnum([
  'ready',
  'needs',
  'unreachable',
  'starting',
]);
export type ConnectorStatus = z.infer<typeof connectorStatusSchema>;

/**
 * A check in flight (`status: "starting"`): when it started, the seconds so far at the
 * read, and whether its server went a whole window with no work. Null otherwise.
 */
export const connectorCheckFields = {
  started_at: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  elapsed_s: z
    .number()
    .nullish()
    .transform((value) => value ?? null),
  stalled: z
    .boolean()
    .nullish()
    .transform((value) => value ?? false),
};

export const connectorStateSchema = z.object({
  status: connectorStatusSchema,
  needs: z.array(z.string()).default([]),
  reason: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  ...connectorCheckFields,
});
export type ConnectorState = z.infer<typeof connectorStateSchema>;

export const connectorSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: wireText,
    logo_url: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    /** The logo on a dark theme, when it differs (`?theme=dark`); null: `logo_url` on every theme. */
    logo_dark_url: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    source: forwardCompatibleEnum(['catalog', 'custom']).default('catalog'),
    /** Installed and ready. It reaches a conversation only when its plugin is added there. */
    enabled: z.boolean().default(false),
    plugin: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    /** `marketplace/id` a conversation's plugin picker adds for this connector. */
    plugin_ref: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    tool_count: z
      .number()
      .int()
      .nonnegative()
      .nullish()
      .transform((value) => value ?? null),
    state: connectorStateSchema,
    needs: z.array(connectorNeedSchema).default([]),
    /** The domain Discover groups it under (clio-agent LZ-D9); null for none. */
    group: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    /** The clio-kit server it runs: enabling it first downloads that server's tools. */
    kit: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    /**
     * What must already be on this machine for it to work, in the catalog's words
     * (clio-agent SL-D8); null for nothing.
     */
    requires: optionalWireString(),
  })
  .passthrough();
export type Connector = z.infer<typeof connectorSchema>;

export const connectorListSchema = z.object({ connectors: z.array(connectorSchema) });

/** What a person types into the card: `null` clears a value. */
export type ConnectorValues = Record<string, string | null>;

/** A server with no entry (AQ11): an address or a command, enabled once created. */
export type ConnectorCreateInput = ({ url: string } | { command: string; args: string[] }) & {
  name?: string;
};

/**
 * One thing an agent needs that is not ready (the `agent_needs` card, clio-agent LZ-D2):
 * a connector, or a plugin that bundles one (`kind`), and why it is not ready
 * (`reasons`: `off`, `needs` a required value, `download` its tools). After Enable all,
 * `progress` says where it is in words.
 */
export const agentNeedItemSchema = z
  .object({
    id: z.string(),
    connector_id: z.string(),
    name: z.string(),
    kind: forwardCompatibleEnum(['connector', 'plugin']).default('connector'),
    logo_url: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    /** The logo on a dark theme, when it differs (`?theme=dark`); null: `logo_url` on every theme. */
    logo_dark_url: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    reasons: z.array(z.string()).default([]),
    enabled: z.boolean().default(false),
    download: z.boolean().default(false),
    download_unknown: z.boolean().default(false),
    asks_sign_in: z.boolean().default(false),
    /** What must already be on this machine, in the catalog's words (SL-D8). */
    requires: optionalWireString(),
    missing: z.array(connectorNeedSchema).default([]),
    settings: z.array(connectorNeedSchema).default([]),
    progress: optionalWireString(),
    reason: optionalWireString(),
    detail: optionalWireString(),
    tool_count: z
      .number()
      .int()
      .nonnegative()
      .nullish()
      .transform((value) => value ?? null),
  })
  .passthrough();
export type AgentNeedItem = z.infer<typeof agentNeedItemSchema>;

/**
 * The `connector_setup` pending interaction's payload (CN5): the tool call that
 * waits, the connector it needs and the rows still missing.
 */
export const connectorSetupPayloadSchema = z
  .object({
    connector_id: z.string(),
    connector_name: optionalWireString(),
    tool_name: optionalWireString(),
    missing: z.array(connectorNeedSchema).default([]),
    /**
     * `enable`: the agent offers to add a connector to this conversation (connector
     * discovery). The card adds it here, turning it on first when it is off.
     * `add_plugin`: the agent offers a plugin of the person's library that follows no
     * connector (plugin discovery); `plugin_id` and `plugin_ref` name it.
     */
    intent: optionalWireString(),
    plugin_id: optionalWireString(),
    plugin_ref: optionalWireString(),
    description: optionalWireString(),
    reason: optionalWireString(),
    agent_ref: optionalWireString(),
    agent_name: optionalWireString(),
    asks_sign_in: z.boolean().optional(),
    /** The connector is on already: the card only adds it to this conversation. */
    connector_enabled: z.boolean().optional(),
    /**
     * `agent_needs`: the agent this conversation runs needs what is not ready (`items`);
     * `phase` is `ask`, `working` (Enable all runs) or `done`.
     */
    phase: optionalWireString(),
    items: z.array(agentNeedItemSchema).default([]),
  })
  .passthrough();
export type ConnectorSetupPayload = z.infer<typeof connectorSetupPayloadSchema>;

/** Reads a pending interaction's payload as a connector setup request, if it is one. */
export function connectorSetupPayload(payload: unknown): ConnectorSetupPayload | undefined {
  const parsed = connectorSetupPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : undefined;
}

/** Whether a `connector_setup` payload is the agent's offer to add a connector here. */
export function isConnectorOffer(payload: unknown): boolean {
  return connectorSetupPayload(payload)?.intent === 'enable';
}

/**
 * Whether a `connector_setup` payload is the agent asking for optional needs of a
 * connector already here (`values`, connector plan KC5): the same card, showing only those.
 */
export function isConnectorValuesRequest(payload: unknown): boolean {
  return connectorSetupPayload(payload)?.intent === 'values';
}

/** Whether a `connector_setup` payload is the agent-load card (`agent_needs`). */
export function isAgentNeeds(payload: unknown): boolean {
  return connectorSetupPayload(payload)?.intent === 'agent_needs';
}

/** Whether a `connector_setup` payload is the agent's offer to add a plugin here. */
export function isPluginOffer(payload: unknown): boolean {
  return connectorSetupPayload(payload)?.intent === 'add_plugin';
}

/** The needs still blocking a connector: what its state names, in the entry's order. */
export function missingNeeds(connector: Connector): ConnectorNeed[] {
  const named = new Set(connector.state.needs);
  return connector.needs.filter((need) => named.has(need.key));
}
