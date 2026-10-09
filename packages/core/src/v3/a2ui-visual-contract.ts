import { z } from 'zod';

/** Renderer-local state is separate from the persistent definition revision. */
export interface A2uiViewerReport {
  viewer_id: string;
  surface_id: string;
  revision: number;
  view_revision: number;
  visible: boolean;
  ready: boolean;
  artifact_id: string;
  state: Record<string, unknown>;
}

export const a2uiCaptureRequestSchema = z.object({
  request_id: z.string(),
  surface_id: z.string(),
  revision: z.number().int(),
  view_revision: z.number().int(),
  component_id: z.string(),
  artifact_id: z.string(),
  data_model_update: z.object({ path: z.string(), value: z.unknown() }).optional(),
});
export type A2uiCaptureRequest = z.infer<typeof a2uiCaptureRequestSchema>;
export interface A2uiCaptureReply {
  request_id: string;
  viewer_id: string;
  revision: number;
  view_revision: number;
  png_base64?: string;
  error?: string;
  previous_view_revision?: number;
}
