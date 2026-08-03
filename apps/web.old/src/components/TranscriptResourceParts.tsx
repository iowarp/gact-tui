/**
 * Transcript part views for MCP resource parts (resource_link and embedded
 * resource) shown inline in a message.
 */
import { For, Show } from 'solid-js';
import type { Part, PartResource, PartResourceLink } from '@clio/core';
import { PartCard } from './TranscriptPartCard.js';

/**
 * A reference to an MCP resource (SPEC §4.5 resource_link). The TUI lists the
 * uri + name + description in the detail view; the web renders the same as a
 * compact card. When the uri is a real URL we make it an actual link (a
 * web-native affordance the TUI can't offer).
 */
export function ResourceLinkPartView(props: { part: PartResourceLink }) {
  const p = props.part;
  const isUrl = () => /^https?:\/\//i.test(p.uri);
  return (
    <PartCard
      variant="resource"
      class="trx-resource--link"
      testId="trx-resource-link"
      icon="catalog"
      head={
        <>
          <strong class="trx-resource__name">{p.name || p.uri}</strong>
          <Show when={p.mime_type}>
            <span class="trx-resource__chip">{p.mime_type}</span>
          </Show>
        </>
      }
    >
      <Show when={isUrl()} fallback={<span class="trx-resource__uri">{p.uri}</span>}>
        <a class="trx-resource__uri trx-resource__uri--link" href={p.uri} target="_blank" rel="noreferrer">
          {p.uri}
        </a>
      </Show>
      <Show when={p.description}>
        <span class="trx-resource__desc">{p.description}</span>
      </Show>
    </PartCard>
  );
}

/**
 * Inline MCP resource content (SPEC §4.5 resource). Carries nested Part[]
 * content; we surface the uri/mime header and a text preview of any inlined
 * text parts so the embedded content is visible rather than dropped.
 */
export function ResourcePartView(props: { part: PartResource }) {
  const p = props.part;
  const textPreview = () =>
    (p.content ?? [])
      .map((c: Part) => (c.type === 'text' ? c.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  return (
    <PartCard
      variant="resource"
      class="trx-resource--inline"
      testId="trx-resource"
      icon="file"
      layout="iconInHead"
      head={
        <>
          <strong class="trx-resource__name">{p.uri}</strong>
          <Show when={p.mime_type}>
            <span class="trx-resource__chip">{p.mime_type}</span>
          </Show>
        </>
      }
    >
      <Show when={textPreview()}>
        <pre class="trx-resource__content" data-testid="trx-resource-content">
          {textPreview()}
        </pre>
      </Show>
      <Show when={!textPreview() && (p.content?.length ?? 0) > 0}>
        <span class="trx-resource__desc">
          <For each={p.content}>{(c) => <span class="trx-resource__chip">{c.type}</span>}</For>
        </span>
      </Show>
    </PartCard>
  );
}
