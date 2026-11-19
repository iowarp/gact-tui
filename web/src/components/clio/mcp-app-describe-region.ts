import type { CssRect, RegionDescription } from './comments/snapshot-comments';
import type { McpAppViewTools } from './mcp-app-view-tools';

/** KF2: CLIO's convention for an app tool that says what lies under a comment mark. */
export const DESCRIBE_REGION_TOOL = 'describe_region';

/**
 * Ask a view what lies under a mark through its own `describe_region` tool, given the
 * mark's rectangle in the view's CSS pixels. Undefined when the view lists no such tool.
 */
export function describeRegionWith(
  tools: McpAppViewTools | undefined,
  rect: CssRect,
): Promise<RegionDescription> | undefined {
  if (!tools?.has(DESCRIBE_REGION_TOOL)) return undefined;
  return tools.callAppTool(DESCRIBE_REGION_TOOL, { ...rect }).then(regionDescription);
}

/** The picture and the description in a `describe_region` result. */
export function regionDescription(result: unknown): RegionDescription {
  const record = isRecord(result) ? result : {};
  if (record.isError === true) {
    const text = contentText(record.content);
    throw new Error(text || 'the view reported an error');
  }
  const content = Array.isArray(record.content) ? record.content : [];
  const image = content.find(
    (item): item is Record<string, unknown> =>
      isRecord(item) && item.type === 'image' && typeof item.data === 'string',
  );
  let under: unknown = isRecord(record.structuredContent) ? record.structuredContent : undefined;
  if (under === undefined) {
    const text = contentText(content);
    try {
      under = text ? JSON.parse(text) : undefined;
    } catch {
      under = text || undefined;
    }
  }
  return {
    image: image
      ? `data:${typeof image.mimeType === 'string' ? image.mimeType : 'image/png'};base64,${String(image.data)}`
      : undefined,
    under,
  };
}

function contentText(content: unknown): string {
  return (Array.isArray(content) ? content : [])
    .flatMap((item) => (isRecord(item) && typeof item.text === 'string' ? [item.text] : []))
    .join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
