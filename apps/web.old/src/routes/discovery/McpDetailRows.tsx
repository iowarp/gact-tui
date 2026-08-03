/**
 * Discovery surface: Mcp Detail Rows component. Key export `McpPromptRow`.
 */
import { createSignal, Show } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { Client, McpServerInfo } from '@clio/core';
import {
  mcpAsyncErrorMessage,
  mcpPromptRenderButtonLabel,
  mcpPromptRenderedText,
  mcpResourcePreviewButtonLabel,
  mcpResourcePreviewText,
  mcpResourceSubscribeButtonLabel,
} from './McpDetailRowsModel.js';

function createAsyncPreview(loadText: () => Promise<string>) {
  const [text, setText] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string | null>(null);

  async function toggle() {
    if (text() !== null) {
      setText(null);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      setText(await loadText());
    } catch (e) {
      setErr(mcpAsyncErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return { text, busy, err, setErr, toggle };
}

function AsyncPreview(props: { err: Accessor<string | null>; text: Accessor<string | null> }) {
  return (
    <>
      <Show when={props.err()}>
        <pre class="mcp__resource-err">{props.err()}</pre>
      </Show>
      <Show when={props.text() !== null}>
        <pre class="mcp__resource-text">{props.text()}</pre>
      </Show>
    </>
  );
}

export function McpPromptRow(props: {
  s: McpServerInfo;
  p: { name: string; description?: string };
  client: Client;
}) {
  const preview = createAsyncPreview(async () => {
    const r = await props.client.mcpGetPrompt(props.s.id, props.p.name, {});
    return mcpPromptRenderedText(r.messages);
  });

  return (
    <li class="mcp__detail-row mcp__detail-row--resource">
      <code class="mcp__detail-name">{props.p.name}</code>
      <Show when={props.p.description}>
        <span class="mcp__detail-desc">{props.p.description}</span>
      </Show>
      <div class="mcp__detail-actions">
        <button
          type="button"
          class="mcp__resource-preview"
          onClick={() => void preview.toggle()}
          disabled={preview.busy()}
          data-testid={`mcp-prompt-render-${props.s.id}-${props.p.name}`}
        >
          {mcpPromptRenderButtonLabel(preview.busy(), preview.text() !== null)}
        </button>
      </div>
      <AsyncPreview err={preview.err} text={preview.text} />
    </li>
  );
}

export function McpResourceRow(props: {
  s: McpServerInfo;
  r: { uri: string; name?: string };
  client: Client;
}) {
  const preview = createAsyncPreview(async () => {
    const r = await props.client.mcpReadResource(props.s.id, props.r.uri);
    return mcpResourcePreviewText(r.contents);
  });
  const [subscribed, setSubscribed] = createSignal(false);

  async function toggleSubscribe() {
    preview.setErr(null);
    try {
      if (subscribed()) {
        await props.client.mcpUnsubscribeResource(props.s.id, props.r.uri);
        setSubscribed(false);
      } else {
        await props.client.mcpSubscribeResource(props.s.id, props.r.uri);
        setSubscribed(true);
      }
    } catch (e) {
      // Subscription failures are row-level errors, so reuse the preview error slot.
      preview.setErr(mcpAsyncErrorMessage(e));
    }
  }

  return (
    <li class="mcp__detail-row mcp__detail-row--resource">
      <code class="mcp__detail-name">{props.r.uri}</code>
      <Show when={props.r.name}>
        <span class="mcp__detail-desc">{props.r.name}</span>
      </Show>
      <div class="mcp__detail-actions">
        <button
          type="button"
          class="mcp__resource-preview"
          onClick={() => void preview.toggle()}
          disabled={preview.busy()}
          data-testid={`mcp-resource-preview-${props.s.id}-${props.r.uri}`}
        >
          {mcpResourcePreviewButtonLabel(preview.busy(), preview.text() !== null)}
        </button>
        <button
          type="button"
          class="mcp__resource-preview"
          onClick={() => void toggleSubscribe()}
          data-testid={`mcp-resource-sub-${props.s.id}-${props.r.uri}`}
        >
          {mcpResourceSubscribeButtonLabel(subscribed())}
        </button>
      </div>
      <AsyncPreview err={preview.err} text={preview.text} />
    </li>
  );
}
