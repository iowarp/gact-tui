import { z } from 'zod';
import { CommentRepository } from './comment-repository.js';

const diagnosticSchema = z.object({
  kind: z.string(),
  message: z.string(),
  file: z.string().default(''),
  line: z.number().int().default(0),
  page: z.number().int().default(0),
  detail: z.string().default(''),
});
const checkSchema = z.object({
  rule: z.string(),
  status: z.string(),
  message: z.string().default(''),
  file: z.string().default(''),
  line: z.number().int().default(0),
});
const placeSchema = z.object({ page: z.number().int(), rect: z.array(z.number()) });
type OutlineNodeShape = {
  kind: string;
  file: string;
  start_line: number;
  end_line: number;
  title?: string;
  level?: number;
  labels?: string[];
  citations?: { key: string; resolved: boolean }[];
  places?: { page: number; rect: number[] }[];
  children?: OutlineNodeShape[];
};
const outlineNodeSchema: z.ZodType<OutlineNodeShape> = z.lazy(() =>
  z.object({
    kind: z.string(),
    file: z.string(),
    start_line: z.number().int(),
    end_line: z.number().int(),
    title: z.string().optional(),
    level: z.number().int().optional(),
    labels: z.array(z.string()).optional(),
    citations: z.array(z.object({ key: z.string(), resolved: z.boolean() })).optional(),
    places: z.array(placeSchema).optional(),
    children: z.array(outlineNodeSchema).optional(),
  }),
);
const buildSchema = z.object({
  status: z.string(),
  entry: z.string(),
  source_artifact_id: z.string().default(''),
  pdf: z.object({ artifact_id: z.string(), name: z.string(), path: z.string() }).nullable(),
  page_count: z.number().int().default(0),
  diagnostics: z.array(diagnosticSchema).default([]),
  counts: z.record(z.string(), z.number()).default({}),
  read: z.array(z.string()).default([]),
  network: z.string().default(''),
  venue: z
    .object({ venue: z.string(), status: z.string(), checks: z.array(checkSchema).default([]) })
    .optional(),
  error: z.string().optional(),
});
const reportSchema = z.object({
  entry: z.string(),
  folder: z.string().default(''),
  build: buildSchema,
  outline: z
    .object({
      nodes: z.array(outlineNodeSchema).default([]),
      counts: z.record(z.string(), z.number()).default({}),
      unresolved_citations: z.array(z.string()).default([]),
      synctex: z.boolean().default(false),
    })
    .nullable(),
  files: z.array(z.string()).default([]),
  texts: z.record(z.string(), z.string()).default({}),
  page_sizes: z.array(z.array(z.number())).default([]),
});
const locateSchema = z.object({
  status: z.string(),
  direction: z.string().default(''),
  page: z.number().int().optional(),
  file: z.string().default(''),
  line: z.number().int().default(0),
  node: z.string().default(''),
  places: z.array(placeSchema).default([]),
  error: z.string().optional(),
});

export type LatexDiagnostic = z.infer<typeof diagnosticSchema>;
export type LatexOutlineNode = OutlineNodeShape;
export type LatexReport = z.infer<typeof reportSchema>;
export type LatexLocation = z.infer<typeof locateSchema>;

/** The LaTeX workspace: a paper's build report and click-through (LaTeX plan). */
export class LatexRepository extends CommentRepository {
  /** Build the paper this `.tex` version is the entry of, with its outline and sources. */
  public latexReport(
    artifactId: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<LatexReport> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/latex?session_id=${encodeURIComponent(sessionId)}`,
      decode: (value) => reportSchema.parse(value),
      signal,
    });
  }

  /** A PDF point's source line (`page`, `x`, `y` in points from the top-left), or a line's places. */
  public latexLocate(
    artifactId: string,
    sessionId: string,
    at: { page: number; x: number; y: number } | { file: string; line: number },
    signal?: AbortSignal,
  ): Promise<LatexLocation> {
    const query = new URLSearchParams({ session_id: sessionId });
    for (const [key, value] of Object.entries(at)) query.set(key, String(value));
    return this.transport.request({
      method: 'GET',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/latex/locate?${query.toString()}`,
      decode: (value) => locateSchema.parse(value),
      signal,
    });
  }
}
