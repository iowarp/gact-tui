/**
 * Renders an `image` transcript part, degrading gracefully when the backend
 * lacks image support. Exports {@link ImagePartView}.
 */
import type { Part } from '@clio/core';
import { Icon } from './Icon.js';

export function ImagePartView(props: { part: Part; imagePartsSupported?: boolean }) {
  const p = props.part as Part & {
    source: {
      kind: 'base64' | 'url' | string;
      data?: string;
      media_type?: string;
      url?: string;
    };
  };
  if (props.imagePartsSupported === false) {
    return (
      <div class="trx-image-unavailable" data-testid="trx-image-unsupported">
        <Icon name="alert" size={12} />
        <span>image not supported by this backend</span>
      </div>
    );
  }
  const src =
    p.source.kind === 'base64' && p.source.data
      ? `data:${p.source.media_type ?? 'image/png'};base64,${p.source.data}`
      : p.source.kind === 'url'
        ? p.source.url
        : undefined;
  if (!src) {
    return (
      <div class="trx-image-unavailable" data-testid="trx-image-unavailable">
        <Icon name="attach" size={12} />
        <span>
          image attachment (backend file reference — open the Inspector Context tab to preview)
        </span>
      </div>
    );
  }
  return (
    <img
      class="trx-image"
      src={src}
      alt={p.source.media_type ?? 'image attachment'}
      loading="lazy"
      data-testid="trx-image"
    />
  );
}
