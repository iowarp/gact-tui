import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CircleIcon as FallbackIcon } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { z } from 'zod';
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
} from '@/components/clio/a2ui-accessibility';
import { kernelIconGlyph } from './kernel-icon-map';

/**
 * CLIO's override of the basic catalog's `Icon` (#1549 G9 #26), split out of
 * `kernel-catalog.tsx` purely for file size (same reason as
 * `kernel-catalog-functions.ts`).
 *
 * Upstream `@a2ui/react`'s `Icon` renders a Material Symbols ligature span
 * (`material-symbols-outlined`) and CLIO never loads that font, so a plain
 * re-export shows the raw `name` string as visible text instead of a glyph.
 * It isn't only literal names: `Icon.name` also accepts a data binding
 * (`{ path: "..." }`), which the generic binder resolves to whatever raw
 * string the data holds at render time, bypassing any enum entirely. That's
 * exactly the QA session's wire payload for #26 (`alert-circle` /
 * `alert-triangle`). `kernel-catalog-icon.test.tsx` covers the literal, the
 * bound and the unmapped case.
 *
 * This does NOT reuse `IconApi` from `@a2ui/web_core` the way `Image`/
 * `Video`/`AudioPlayer` reuse their basic-catalog APIs: `IconApi.schema`
 * restricts `name` to a fixed enum, but the clio-schemas catalog JSON
 * (`catalogs/clio-workspace/v1/catalog.json`) declares it as
 * `oneOf [string, IconSvgPath, DataBinding]` -- any string is a valid literal
 * server-side. Reusing the enum schema meant a literal name outside it (the
 * adversarial review's `'alert-circle'` as a plain literal, not bound)
 * failed validation and replaced the WHOLE surface with a failure card
 * before this component ever got a chance to render its fallback. `iconName`
 * below mirrors the server's contract instead.
 */
const iconName = z.union([
  z.string(),
  z.object({ svgPath: z.string() }).strict(),
  CommonSchemas.DataBinding,
]);
const accessibility = CommonSchemas.AccessibilityAttributes.optional();
const weight = z.number().optional();

/**
 * CLIO's kernel override of `Icon`: renders lucide glyphs instead of an
 * unloaded icon font, and never prints a name as text.
 */
export const KernelIcon = createComponentImplementation(
  { name: 'Icon', schema: z.object({ name: iconName, accessibility, weight }).strict() },
  ({ props }) => {
    const label = a2uiAccessibilityLabel(props.accessibility);

    if (typeof props.name === 'object' && props.name !== null && 'svgPath' in props.name) {
      return (
        <svg
          {...a2uiAccessibilityProps(props.accessibility)}
          aria-hidden={label ? undefined : true}
          className="size-4 shrink-0"
          fill="currentColor"
          role={label ? 'img' : undefined}
          viewBox="0 0 24 24"
        >
          <path d={props.name.svgPath} />
        </svg>
      );
    }

    const rawName = typeof props.name === 'string' ? props.name : '';
    const IconGlyph = kernelIconGlyph(rawName);

    // An unknown or still-unresolved name never prints as text (#26): a
    // visible neutral glyph instead. The accessible name stays a generic
    // "Icon" -- never the raw identifier as technical copy -- with the name
    // available for debugging only in the hover tooltip.
    if (!IconGlyph) {
      const title = rawName ? t`Icon: ${rawName}` : t`Icon`;
      return (
        <span
          {...a2uiAccessibilityProps(props.accessibility)}
          aria-label={label ?? t`Icon`}
          className="inline-flex"
          role="img"
          title={title}
        >
          <FallbackIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </span>
      );
    }

    return (
      <span
        {...a2uiAccessibilityProps(props.accessibility)}
        aria-hidden={label ? undefined : true}
        className="inline-flex"
        role={label ? 'img' : undefined}
      >
        <IconGlyph className="size-4 shrink-0" />
      </span>
    );
  },
);
