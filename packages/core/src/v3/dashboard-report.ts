import { z } from 'zod';
import { a2uiSurfaceSchema } from './schemas.js';

/** An agent-authored dashboard system with a pinned A2UI definition. */
export const dashboardReportSchema = z.object({
  format: z.literal('clio.dashboard.v1'),
  id: z.string(),
  session_id: z.string(),
  title: z.string().min(1).max(200),
  created_at: z.string(),
  surface: a2uiSurfaceSchema,
  definition_path: z.string(),
  definition: z.record(z.string(), z.unknown()),
  sources: z.array(z.object({ surface_id: z.string(), revision: z.number().int().nonnegative() })),
});
export type DashboardReport = z.infer<typeof dashboardReportSchema>;

export const savedDashboardSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  artifact_id: z.string(),
});
export type SavedDashboard = z.infer<typeof savedDashboardSchema>;
