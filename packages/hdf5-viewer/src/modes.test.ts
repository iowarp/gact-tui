import { DTypeClass, EntityKind, ShapeClass, type DType, type ProvidedEntity } from '@h5web/app';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dtypeName, modeOfVis, observeView, readView, selectMode, shapeOf } from './modes';

/**
 * A stand-in for h5web's chrome with the accessible names modes.ts relies on:
 * the sidebar toggle, the Display/Inspect tabs and the visualization tabs.
 */
function renderChrome({ vis = ['Matrix', 'Line'], selected = 'Line', inspecting = false } = {}) {
  document.body.innerHTML = `
    <div id="root">
      <div>
        <button type="button" aria-label="Toggle sidebar" aria-pressed="true"></button>
        <div role="tablist" aria-label="Viewer mode">
          <button type="button" role="tab" aria-checked="${!inspecting}">Display</button>
          <button type="button" role="tab" aria-checked="${inspecting}">Inspect</button>
        </div>
      </div>
      <div id="vis"></div>
    </div>`;
  const root = document.getElementById('root')!;
  const sidebar = root.querySelector<HTMLButtonElement>('[aria-label="Toggle sidebar"]')!;
  sidebar.addEventListener('click', () =>
    sidebar.setAttribute('aria-pressed', String(sidebar.getAttribute('aria-pressed') !== 'true')),
  );
  const [display, inspect] = root.querySelectorAll<HTMLButtonElement>(
    '[aria-label="Viewer mode"] button',
  );
  const renderVis = (active: string | undefined) => {
    const host = root.querySelector('#vis')!;
    host.innerHTML = active
      ? `<div role="tablist" aria-label="Visualization">${vis
          .map(
            (name) =>
              `<button type="button" role="tab" aria-selected="${name === active}"><svg></svg>${name}</button>`,
          )
          .join('')}</div>`
      : '';
    host
      .querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .forEach((tab) =>
        tab.addEventListener('click', () => renderVis(tab.textContent ?? undefined)),
      );
  };
  let current: string | undefined = selected;
  display!.addEventListener('click', () => {
    display!.setAttribute('aria-checked', 'true');
    inspect!.setAttribute('aria-checked', 'false');
    renderVis(current);
  });
  inspect!.addEventListener('click', () => {
    current = root.querySelector('[aria-selected="true"]')?.textContent ?? current;
    display!.setAttribute('aria-checked', 'false');
    inspect!.setAttribute('aria-checked', 'true');
    renderVis(undefined);
  });
  renderVis(inspecting ? undefined : selected);
  return { root, sidebar };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('modeOfVis', () => {
  it('groups h5web visualizations into the frame modes', () => {
    expect(modeOfVis('NX Line')).toBe('plot');
    expect(modeOfVis('Line')).toBe('plot');
    expect(modeOfVis('Heatmap')).toBe('image');
    expect(modeOfVis('NX RGB')).toBe('image');
    expect(modeOfVis('Matrix')).toBe('table');
    expect(modeOfVis('Scalar')).toBe('table');
    expect(modeOfVis('Something new')).toBe('table');
  });
});

describe('readView', () => {
  it('offers each visualization family once, in frame order, then attributes', () => {
    const { root } = renderChrome({
      vis: ['Matrix', 'Line', 'Heatmap', 'Surface'],
      selected: 'Heatmap',
    });
    expect(readView(root)).toEqual({
      modes: ['table', 'plot', 'image', 'attributes'],
      mode: 'image',
      explorer: true,
    });
  });

  it('keeps the last display modes while attributes show', () => {
    const { root } = renderChrome();
    const shown = readView(root);
    root.querySelector<HTMLButtonElement>('[role="tab"][aria-checked="false"]')!.click();
    expect(readView(root, shown)).toEqual({
      modes: ['table', 'plot', 'attributes'],
      mode: 'attributes',
      explorer: true,
    });
  });
});

describe('selectMode', () => {
  it('clicks the first visualization of the mode', () => {
    const { root } = renderChrome();
    expect(selectMode(root, 'table')).toBe(true);
    expect(readView(root).mode).toBe('table');
  });

  it('switches to Inspect for attributes and back to the display', () => {
    const { root } = renderChrome();
    selectMode(root, 'attributes');
    expect(readView(root).mode).toBe('attributes');
    expect(selectMode(root, 'table')).toBe(true);
    expect(readView(root).mode).toBe('table');
  });
});

describe('observeView', () => {
  it('reports changes once and applies host requests', async () => {
    const { root, sidebar } = renderChrome();
    const onChange = vi.fn();
    const view = observeView(root, onChange);
    expect(onChange).toHaveBeenLastCalledWith({
      modes: ['table', 'plot', 'attributes'],
      mode: 'plot',
      explorer: true,
    });

    view.show({ mode: 'table', explorer: false });
    expect(sidebar.getAttribute('aria-pressed')).toBe('false');
    expect(onChange).toHaveBeenLastCalledWith({
      modes: ['table', 'plot', 'attributes'],
      mode: 'table',
      explorer: false,
    });

    const calls = onChange.mock.calls.length;
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(calls);
    view.dispose();
  });
});

describe('entity facts', () => {
  const float = { class: DTypeClass.Float, size: 32, endianness: undefined } as DType;
  const dataset = (shape: unknown) =>
    ({
      kind: EntityKind.Dataset,
      name: 'sm',
      path: '/2020/sm',
      attributes: [],
      shape,
      type: float,
    }) as unknown as ProvidedEntity;

  it('reads a dataset shape, a scalar and an empty dataset', () => {
    expect(shapeOf(dataset({ class: ShapeClass.Array, dims: [365, 721, 1440] }))).toEqual([
      365, 721, 1440,
    ]);
    expect(shapeOf(dataset({ class: ShapeClass.Scalar, dims: [] }))).toEqual([]);
    expect(shapeOf(dataset({ class: ShapeClass.Null }))).toBeUndefined();
  });

  it('names element types as numpy does', () => {
    expect(dtypeName(float)).toBe('float32');
    expect(
      dtypeName({ class: DTypeClass.Integer, signed: false, size: 8, endianness: undefined }),
    ).toBe('uint8');
    expect(
      dtypeName({ class: DTypeClass.Integer, signed: true, size: 16, endianness: undefined }),
    ).toBe('int16');
    expect(
      dtypeName({
        class: DTypeClass.Bool,
        base: { class: DTypeClass.Integer, signed: true, size: 8, endianness: undefined },
      } as DType),
    ).toBe('bool');
  });
});
