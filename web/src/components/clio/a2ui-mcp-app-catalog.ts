import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createElement } from 'react';
import { z } from 'zod';
import { ClioMcpApp, type McpAppDataContext } from './a2ui-mcp-app';

// Mirrors clio-schemas `clio.mcp-app.v1` (clio-workspace/v1 catalog).
const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u);

const channelSchema = z
  .object({
    key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/u),
    path: z
      .string()
      .max(256)
      .regex(/^(\/[^/\s]+)+$/u),
    tool: name.optional(),
  })
  .strict();

function distinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export const mcpAppSchema = z
  .object({
    server: name,
    tool: name,
    arguments: z.record(z.string(), z.unknown()).optional(),
    state: z
      .array(channelSchema)
      .max(16)
      .refine((channels) => distinct(channels.map((channel) => channel.key)), {
        message: 'state channel keys must be distinct',
      })
      .refine((channels) => distinct(channels.map((channel) => channel.path)), {
        message: 'state channel paths must be distinct',
      })
      .optional(),
    height: z.number().int().min(160).max(2000).optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict();

const NO_ARGUMENTS: Record<string, unknown> = {};

/** Protocol adapter for `clio.mcp-app.v1`: an MCP App's view, opened by its call. */
export const ClioMcpAppCatalogComponent = createComponentImplementation(
  { name: 'clio.mcp-app.v1', schema: mcpAppSchema },
  ({ props, context }) =>
    createElement(ClioMcpApp, {
      // The call and the channels are read as authored: an argument shaped like
      // {path} is the tool's own value, never a data-model binding.
      args:
        (context.componentModel.properties.arguments as Record<string, unknown> | undefined) ??
        NO_ARGUMENTS,
      channels: props.state ?? [],
      componentId: context.componentModel.id,
      dataContext: context.dataContext as unknown as McpAppDataContext,
      height: props.height,
      server: props.server,
      surfaceId: context.dataContext.surface.id,
      tool: props.tool,
    }),
);
