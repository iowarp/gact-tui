import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';

afterEach(() => {
  cleanup();
});

const TEST_CATALOG_ID = 'test://kernel-catalog-icon';
const testCatalog = new Catalog(
  TEST_CATALOG_ID,
  [...KERNEL_COMPONENTS.values()],
  [...KERNEL_FUNCTIONS.values()],
);
const SURFACE_ID = 'icon-surface';

function buildIconSurface(extraMessages: A2uiMessage[]) {
  const processor = new MessageProcessor([testCatalog], async () => undefined, {
    version: 'v0.9.1',
  });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId: SURFACE_ID, catalogId: TEST_CATALOG_ID } },
    ...extraMessages,
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(SURFACE_ID);
  if (!surface) throw new Error('Expected the test surface to exist');
  return surface;
}

function iconSurfaceWithLiteralName(name: string) {
  return buildIconSurface([
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'root', component: 'Icon', name }],
      },
    },
  ] as A2uiMessage[]);
}

/**
 * #1549 G9 #26: upstream `@a2ui/react`'s `Icon` renders a Material Symbols
 * ligature span (`material-symbols-outlined`), and CLIO never loads that
 * font, so every icon shows its own name as plain visible text instead of a
 * glyph -- both for a literal catalog-enum name and, as the QA session
 * confirmed from the wire payload, for a name arriving through a data
 * binding (which bypasses the enum entirely; see the root-cause note in
 * `kernel-catalog-icon.tsx`).
 */
describe('kernel Icon (#1549 G9 #26)', () => {
  it('renders a literal catalog icon name as a glyph, not literal text', () => {
    const surface = iconSurfaceWithLiteralName('warning');

    const { container } = render(<A2uiSurface surface={surface} />);

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('warning')).not.toBeInTheDocument();
  });

  it('renders a data-bound name outside the catalog enum as a glyph, not literal text (#26 repro)', () => {
    const surface = buildIconSurface([
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: SURFACE_ID,
          components: [{ id: 'root', component: 'Icon', name: { path: '/severityIcon' } }],
        },
      },
      {
        version: 'v0.9.1',
        updateDataModel: { surfaceId: SURFACE_ID, path: '/severityIcon', value: 'alert-circle' },
      },
    ] as A2uiMessage[]);

    const { container } = render(<A2uiSurface surface={surface} />);

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('alert-circle')).not.toBeInTheDocument();
  });

  it('shows a visible neutral fallback glyph, never the raw name as text or as the accessible name, for an unmapped name', () => {
    const surface = buildIconSurface([
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: SURFACE_ID,
          components: [{ id: 'root', component: 'Icon', name: { path: '/severityIcon' } }],
        },
      },
      {
        version: 'v0.9.1',
        updateDataModel: {
          surfaceId: SURFACE_ID,
          path: '/severityIcon',
          value: 'not_a_real_icon',
        },
      },
    ] as A2uiMessage[]);

    const { container } = render(<A2uiSurface surface={surface} />);

    const fallback = container.querySelector('svg');
    expect(fallback).toBeInTheDocument();
    expect(screen.queryByText('not_a_real_icon')).not.toBeInTheDocument();
    // Adversarial review: the accessible name must not expose the raw
    // identifier as technical copy -- it stays a generic "Icon", with the
    // name available only in the hover tooltip (`title`).
    expect(screen.getByLabelText('Icon')).toBe(fallback!.closest('[role="img"]'));
    expect(fallback!.closest('[role="img"]')).toHaveAttribute('title', 'Icon: not_a_real_icon');
  });
});

/**
 * Adversarial review of #514, finding #1: `KERNEL_ICON_MAP` was a plain
 * object read with bracket access (`map[rawName]`). A bound name equal to a
 * property every plain object inherits from `Object.prototype` --
 * `constructor`, `__proto__`, `hasOwnProperty`, or `valueOf` (what
 * `value-of` normalizes to) -- read that inherited member (a function, for
 * all of these) instead of `undefined`, which the component then tried to
 * render as a React element and crashed the whole surface into the failure
 * card. A `Map` has no prototype-chain lookup to collide with.
 */
describe('kernel Icon prototype-safe lookup (adversarial review #514 finding 1)', () => {
  it.each(['constructor', '__proto__', 'hasOwnProperty', 'value-of'])(
    'renders the visible fallback instead of crashing for the bound name %j',
    (name) => {
      const surface = buildIconSurface([
        {
          version: 'v0.9.1',
          updateComponents: {
            surfaceId: SURFACE_ID,
            components: [{ id: 'root', component: 'Icon', name: { path: '/severityIcon' } }],
          },
        },
        { version: 'v0.9.1', updateDataModel: { surfaceId: SURFACE_ID, path: '/severityIcon', value: name } },
      ] as A2uiMessage[]);

      expect(() => render(<A2uiSurface surface={surface} />)).not.toThrow();
      expect(screen.getByLabelText('Icon')).toBeInTheDocument();
      expect(screen.queryByText(/unknown component/iu)).not.toBeInTheDocument();
    },
  );
});

/**
 * Adversarial review of #514, finding #2: `KernelIcon` reused `IconApi`'s own
 * `z.enum(ICON_NAMES)` schema, but the clio-schemas catalog JSON declares
 * `Icon.name` as `oneOf [string, IconSvgPath, DataBinding]` -- any string is
 * a valid literal server-side. A literal name outside the enum therefore
 * failed `componentApi.schema.safeParse` and `MessageProcessor` THREW
 * (surfaced upstream as a whole-surface failure card), so the fallback this
 * component renders for an unmapped name never even ran.
 */
describe('kernel Icon literal names accept any string (adversarial review #514 finding 2)', () => {
  it('accepts an arbitrary literal string against the Icon schema directly', () => {
    const schema = KERNEL_COMPONENTS.get('Icon')!.schema;
    expect(schema.safeParse({ name: 'alert-circle' }).success).toBe(true);
    expect(schema.safeParse({ name: 'definitely-not-an-icon' }).success).toBe(true);
  });

  it('renders a mapped literal name as a glyph without failing the surface', () => {
    expect(() => iconSurfaceWithLiteralName('alert-circle')).not.toThrow();
    const surface = iconSurfaceWithLiteralName('alert-circle');

    const { container } = render(<A2uiSurface surface={surface} />);

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText(/unknown component/iu)).not.toBeInTheDocument();
  });

  it('renders an unmapped literal name as the visible fallback without failing the surface', () => {
    expect(() => iconSurfaceWithLiteralName('definitely-not-an-icon')).not.toThrow();
    const surface = iconSurfaceWithLiteralName('definitely-not-an-icon');

    const { container } = render(<A2uiSurface surface={surface} />);

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByLabelText('Icon')).toBeInTheDocument();
    expect(screen.queryByText(/unknown component/iu)).not.toBeInTheDocument();
  });
});
