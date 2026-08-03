/**
 * UI component: Brand Mark. Exports `BrandMark`.
 */
import { brand } from '@brand';
import { Show } from 'solid-js';

/**
 * The product mark used across the chrome (left rail, splash, connect).
 *
 * Renders the brand's single-character glyph inside a CSS-styled tile (the
 * lockup classes supply the accent-gradient / surface background + sizing, so
 * the mark follows the brand accent token automatically). Brand-neutral by
 * default: the CLIO profile yields "C", the GACT profile yields "G".
 *
 * Note: a profile's `logoSvg` is used for the favicon / OS icon (which are
 * full-bleed image surfaces), NOT here — the chrome tiles are typographic
 * marks styled by CSS, so they take the glyph.
 *
 * `class` is applied to the wrapping element so each lockup keeps its own
 * sizing/typography (rail__wordmark, splash__mark, connect__mark).
 */
export function BrandMark(props: { class?: string; useImage?: boolean }) {
  return (
    <div
      class={[props.class, props.useImage && brand.logoImage ? 'brand-mark--image' : '']
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <Show when={props.useImage ? brand.logoImage : null} fallback={brand.markGlyph}>
        {(src) => <img src={src()} alt="" />}
      </Show>
    </div>
  );
}
