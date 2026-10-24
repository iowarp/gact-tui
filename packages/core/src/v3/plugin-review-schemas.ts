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
});

export type PluginReview = z.infer<typeof pluginReviewSchema>;
