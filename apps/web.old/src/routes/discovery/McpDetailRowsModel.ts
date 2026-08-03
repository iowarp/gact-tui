/**
 * View-model / pure logic for Mcp Detail Rows: state shaping and helpers, no DOM. Key export `McpPromptMessage`.
 */
export interface McpPromptMessage {
  role: string;
  content: {
    text?: string | null;
  };
}

export interface McpResourceContent {
  text?: string | null;
  mimeType?: string | null;
}

export function mcpPromptRenderedText(messages: McpPromptMessage[] | undefined): string {
  const text = (messages ?? [])
    .map((message) => `${message.role.toUpperCase()}\n${message.content.text ?? '[non-text]'}`)
    .join('\n\n');
  return text || '(empty)';
}

export function mcpResourcePreviewText(contents: McpResourceContent[] | undefined): string {
  const text = (contents ?? [])
    .map((content) => content.text ?? `[${content.mimeType ?? 'binary'}]`)
    .join('\n');
  return text || '(empty)';
}

export function mcpAsyncErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function mcpPromptRenderButtonLabel(busy: boolean, rendered: boolean): string {
  if (busy) return '…';
  return rendered ? 'Hide' : 'Render';
}

export function mcpResourcePreviewButtonLabel(busy: boolean, previewed: boolean): string {
  if (busy) return '…';
  return previewed ? 'Hide' : 'Preview';
}

export function mcpResourceSubscribeButtonLabel(subscribed: boolean): string {
  return subscribed ? '✓ Subscribed' : 'Subscribe';
}
