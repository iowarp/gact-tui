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
    default: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    value: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    has_value: z.boolean().default(false),
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

export const connectorStatusSchema = forwardCompatibleEnum(['ready', 'needs', 'unreachable']);
export type ConnectorStatus = z.infer<typeof connectorStatusSchema>;

export const connectorStateSchema = z.object({
  status: connectorStatusSchema,
  needs: z.array(z.string()).default([]),
  reason: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
});
export type ConnectorState = z.infer<typeof connectorStateSchema>;

/** Every conversation, or only the agents named, by agent reference. */
export const connectorScopeSchema = z.union([
  z.literal('all'),
  z.object({ agents: z.array(z.string()) }),
]);
export type ConnectorScope = z.infer<typeof connectorScopeSchema>;

export const connectorSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: wireText,
    logo_url: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    source: forwardCompatibleEnum(['catalog', 'custom']).default('catalog'),
    enabled: z.boolean().default(false),
    scope: connectorScopeSchema.nullish().transform((value) => value ?? null),
    plugin: z
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
  })
  .passthrough();
export type Connector = z.infer<typeof connectorSchema>;

export const connectorListSchema = z.object({ connectors: z.array(connectorSchema) });

/** What a person types into the card: `null` clears a value. */
export type ConnectorValues = Record<string, string | null>;

/** A server with no entry (AQ11): an address or a command, enabled where `scope` says. */
export type ConnectorCreateInput = ({ url: string } | { command: string; args: string[] }) & {
  name?: string;
  scope?: ConnectorScope;
};

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
     * `enable`: the agent offers a connector that is off (connector discovery). The
     * card turns it on, for every conversation or this conversation's agent.
     */
    intent: optionalWireString(),
    description: optionalWireString(),
    reason: optionalWireString(),
    agent_ref: optionalWireString(),
    agent_name: optionalWireString(),
    asks_sign_in: z.boolean().optional(),
  })
  .passthrough();
export type ConnectorSetupPayload = z.infer<typeof connectorSetupPayloadSchema>;

/** Reads a pending interaction's payload as a connector setup request, if it is one. */
export function connectorSetupPayload(payload: unknown): ConnectorSetupPayload | undefined {
  const parsed = connectorSetupPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : undefined;
}

/** Whether a `connector_setup` payload is the agent's offer of a connector that is off. */
export function isConnectorOffer(payload: unknown): boolean {
  return connectorSetupPayload(payload)?.intent === 'enable';
}

/** The needs still blocking a connector: what its state names, in the entry's order. */
export function missingNeeds(connector: Connector): ConnectorNeed[] {
  const named = new Set(connector.state.needs);
  return connector.needs.filter((need) => named.has(need.key));
}
