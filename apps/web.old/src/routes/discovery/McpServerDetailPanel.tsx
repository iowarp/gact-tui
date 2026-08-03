/**
 * Discovery surface: Mcp Server Detail Panel component. Key export `McpServerDetailPanel`.
 */
import { createResource, For, Show } from 'solid-js';
import type { Client, McpServerInfo } from '@clio/core';
import { McpPromptRow, McpResourceRow } from './McpDetailRows.js';

interface McpServerDetail {
  tools: Array<{ name: string; description?: string }>;
  resources: Array<{ uri: string; name?: string }>;
  prompts: Array<{ name: string; description?: string }>;
  templates: Array<{ uriTemplate: string; name?: string; description?: string }>;
}

async function loadMcpServerDetail(client: Client, serverId: string): Promise<McpServerDetail> {
  const [toolsR, resR, promptsR, tmplR] = await Promise.allSettled([
    client.mcpServerTools(serverId),
    client.mcpServerResources(serverId),
    client.mcpServerPrompts(serverId),
    client.mcpServerResourceTemplates(serverId),
  ]);
  return {
    tools:
      toolsR.status === 'fulfilled'
        ? (toolsR.value.tools as Array<{ name: string; description?: string }>)
        : [],
    resources:
      resR.status === 'fulfilled'
        ? (resR.value.resources as Array<{ uri: string; name?: string }>)
        : [],
    prompts:
      promptsR.status === 'fulfilled'
        ? (promptsR.value.prompts as Array<{ name: string; description?: string }>)
        : [],
    templates:
      tmplR.status === 'fulfilled'
        ? (tmplR.value.templates as Array<{
            uriTemplate: string;
            name?: string;
            description?: string;
          }>)
        : [],
  };
}

export function McpServerDetailPanel(props: { s: McpServerInfo; client: Client }) {
  const [detail] = createResource(
    () => props.s.id,
    (sid) => loadMcpServerDetail(props.client, sid),
  );

  return (
    <div class="mcp__detail">
      <Show when={detail.loading}>
        <div class="mcp__detail-status">Loading…</div>
      </Show>
      <Show when={!detail.loading && detail()}>
        <Show when={(detail()?.tools ?? []).length > 0}>
          <div class="mcp__detail-section">
            <div class="mcp__detail-title">Tools</div>
            <ul class="mcp__detail-list">
              <For each={detail()?.tools ?? []}>
                {(t) => (
                  <li class="mcp__detail-row">
                    <code class="mcp__detail-name">{t.name}</code>
                    <Show when={t.description}>
                      <span class="mcp__detail-desc">{t.description}</span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={(detail()?.resources ?? []).length > 0}>
          <div class="mcp__detail-section">
            <div class="mcp__detail-title">Resources</div>
            <ul class="mcp__detail-list">
              <For each={detail()?.resources ?? []}>
                {(r) => <McpResourceRow s={props.s} r={r} client={props.client} />}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={(detail()?.prompts ?? []).length > 0}>
          <div class="mcp__detail-section">
            <div class="mcp__detail-title">Prompts</div>
            <ul class="mcp__detail-list">
              <For each={detail()?.prompts ?? []}>
                {(p) => <McpPromptRow s={props.s} p={p} client={props.client} />}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={(detail()?.templates ?? []).length > 0}>
          <div class="mcp__detail-section">
            <div class="mcp__detail-title">Resource templates</div>
            <ul class="mcp__detail-list">
              <For each={detail()?.templates ?? []}>
                {(t) => (
                  <li class="mcp__detail-row">
                    <code class="mcp__detail-name">{t.uriTemplate}</code>
                    <Show when={t.description}>
                      <span class="mcp__detail-desc">{t.description}</span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
        <Show
          when={
            (detail()?.tools.length ?? 0) === 0 &&
            (detail()?.resources.length ?? 0) === 0 &&
            (detail()?.prompts.length ?? 0) === 0 &&
            (detail()?.templates?.length ?? 0) === 0
          }
        >
          <div class="mcp__detail-status">No detail available.</div>
        </Show>
      </Show>
    </div>
  );
}
