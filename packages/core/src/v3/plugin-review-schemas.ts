import { z } from 'zod';

/**
 * What a person reviews before trusting a plugin (`GET /v1/plugins/{name}/review`).
 * Everything is read from the plugin's files without running them; `reach`
 * names what its code does directly (beyond asking the agent's own agents),
 * `unreadable` the Python files that did not parse.
 */
export const pluginReviewSchema = z.object({
  name: z.string().min(1),
  version: z.string().default(''),
  description: z.string().default(''),
  flows: z
    .array(
      z.object({
        id: z.string(),
        description: z.string().default(''),
        /** Railroad-beta source the author drew; empty when they drew none. */
        shape: z.string().default(''),
        /** The plugin-relative path of the module declaring the flow. */
        file: z.string().default(''),
      }),
    )
    .default([]),
  /** A subset of `commands`, `dynamic code`, `files`, `network`; new names may appear. */
  reach: z.array(z.string()).default([]),
  unreadable: z.array(z.string()).default([]),
  /** Relative path to text; cut short when `files_truncated`. */
  files: z.record(z.string(), z.string()).default({}),
  files_truncated: z.boolean().default(false),
  authored_by_clio: z.boolean().default(false),
  /** Python tools, read from their decorators: what each says it does. */
  tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().default(''),
        read_only: z.boolean().default(false),
        file: z.string().default(''),
      }),
    )
    .default([]),
  /** Hooks: the event each runs on and the tools it matches. */
  hooks: z
    .array(
      z.object({
        id: z.string(),
        event: z.string().default(''),
        tools: z.string().default(''),
        description: z.string().default(''),
        file: z.string().default(''),
      }),
    )
    .default([]),
  subagents: z
    .array(
      z.object({
        id: z.string(),
        description: z.string().default(''),
        file: z.string().default(''),
      }),
    )
    .default([]),
  /** Script bindings: Python bound into the agent's scripts under a name. */
  bindings: z.array(z.object({ name: z.string(), source: z.string().default('') })).default([]),
  /** Tool servers the plugin starts. */
  servers: z.array(z.string()).default([]),
  /** Executable files changed since a version the person trusted; null: never trusted. */
  changed_since_trusted: z.array(z.string()).nullable().default(null),
});

export type PluginReview = z.infer<typeof pluginReviewSchema>;
