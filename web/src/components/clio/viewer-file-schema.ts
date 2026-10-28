import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { z } from 'zod';

/** A file a viewer may load: a registered artifact, whether literal or bound. */
export const VIEWER_ARTIFACT_URI = /^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u;

/**
 * A viewer's file property (`meshUri`, `materialUri`, `rasterUri`): a literal
 * registered artifact URI, or a binding or function call that resolves to one, so a
 * list's selection can drive the viewer. The resolved value is checked where it is
 * shown (`ViewerFileGate`), since a binding can resolve to anything.
 */
export const viewerFileUriSchema = z.union([
  z.string().regex(VIEWER_ARTIFACT_URI),
  CommonSchemas.DataBinding,
  CommonSchemas.FunctionCall,
]);
