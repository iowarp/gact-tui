import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TEST_CATALOG_ID = 'test://kernel-catalog-open-url';
const testCatalog = new Catalog(
  TEST_CATALOG_ID,
  [...KERNEL_COMPONENTS.values()],
  [...KERNEL_FUNCTIONS.values()],
);

function buildOpenUrlSurface(url: string) {
  const surfaceId = 'open-url-surface';
  const processor = new MessageProcessor([testCatalog], async () => undefined, {
    version: 'v0.9.1',
  });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId, catalogId: TEST_CATALOG_ID } },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId,
        components: [
          {
            id: 'root',
            component: 'Button',
            child: 'label',
            action: { functionCall: { call: 'openUrl', args: { url } } },
          },
          { id: 'label', component: 'Text', text: 'Open' },
        ],
      },
    },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) throw new Error('Expected the test surface to exist');
  return surface;
}

/**
 * The official Basic catalog's `openUrl` (`@a2ui/web_core`'s
 * `OpenUrlImplementation`) opens any `http:`/`https:` URL — S8 known gap,
 * `contract/SPEC.md`. `KERNEL_FUNCTIONS` overrides it (`kernel-catalog.tsx`)
 * to enforce owner decision 11's allowlist (`A2UI_ALLOWED_URL_SCHEMES`:
 * `https:`/`artifact:`/`resource:`, excluding plain `http:`) the same way
 * the render-time media guards (Image/Video/AudioPlayer) do.
 */
describe('kernel openUrl allowlist (owner decision 11)', () => {
  it('opens an allowed https: URL', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const surface = buildOpenUrlSurface('https://iowarp.ai/docs');

    render(<A2uiSurface surface={surface} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    expect(openSpy).toHaveBeenCalledWith('https://iowarp.ai/docs', '_blank', 'noopener,noreferrer');
  });

  it('blocks a plain http: URL instead of opening it', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const surface = buildOpenUrlSurface('http://iowarp.ai/docs');
    const onError = vi.fn();
    surface.onError.subscribe(onError);

    render(<A2uiSurface surface={surface} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    expect(openSpy).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        message: expect.stringContaining('"http:" is not an allowed URL scheme'),
      }),
    );
  });

  it('blocks a non-http(s) scheme such as javascript:', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    // eslint-disable-next-line no-script-url -- proving the allowlist blocks it, never executed
    const surface = buildOpenUrlSurface('javascript:alert(1)');
    const onError = vi.fn();
    surface.onError.subscribe(onError);

    render(<A2uiSurface surface={surface} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    expect(openSpy).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });
});
