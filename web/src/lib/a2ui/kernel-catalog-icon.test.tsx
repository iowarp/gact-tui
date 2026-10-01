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
    const surface = buildIconSurface([
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: SURFACE_ID,
          components: [{ id: 'root', component: 'Icon', name: 'warning' }],
        },
      },
    ] as A2uiMessage[]);

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

  it('shows a visible neutral fallback glyph, never the raw name as text, for an unmapped name', () => {
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

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('not_a_real_icon')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/not_a_real_icon/iu)).toBeInTheDocument();
  });
});
