import { createComponentImplementation } from '@a2ui/react/v0_9';
import { Catalog, CommonSchemas, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { A2uiSurface } from './kernel-catalog';
import { wrapKernelComponentWithPresets } from './kernel-presets';

afterEach(cleanup);

it('removes omitted optional properties after a complete component replacement', async () => {
  const probe = createComponentImplementation(
    {
      name: 'Probe',
      schema: z.object({ value: z.string(), obsolete: z.string().optional() }),
    },
    ({ props }) => <pre>{JSON.stringify(props)}</pre>,
  );
  const catalog = new Catalog(
    'test://replacement',
    [wrapKernelComponentWithPresets(probe, 'Probe', undefined)],
    [],
  );
  const processor = new MessageProcessor([catalog], async () => undefined, { version: 'v0.9.1' });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId: 'surface', catalogId: catalog.id } },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'surface',
        components: [{ id: 'root', component: 'Probe', value: 'first', obsolete: 'stale' }],
      },
    },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface('surface')!;
  const { container } = render(<A2uiSurface surface={surface} />);
  await screen.findByText('{"value":"first","obsolete":"stale"}');
  act(() =>
    processor.processMessages([
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: 'surface',
          components: [{ id: 'root', component: 'Probe', value: 'second' }],
        },
      },
    ] as A2uiMessage[]),
  );
  await screen.findByText('{"value":"second"}');
  expect(container.querySelector('[data-a2ui-component-id="root"]')).toBeTruthy();
  expect(container.textContent).not.toContain('stale');
});

it('retains human data-model input when the component definition is replaced', async () => {
  const probe = createComponentImplementation(
    { name: 'Probe', schema: z.object({ value: CommonSchemas.DynamicString, label: z.string() }) },
    ({ props }) => (
      <pre>
        {props.label}: {props.value}
      </pre>
    ),
  );
  const catalog = new Catalog(
    'test://input',
    [wrapKernelComponentWithPresets(probe, 'Probe', undefined)],
    [],
  );
  const processor = new MessageProcessor([catalog], async () => undefined, { version: 'v0.9.1' });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId: 'surface', catalogId: catalog.id } },
    {
      version: 'v0.9.1',
      updateDataModel: { surfaceId: 'surface', path: '/input', value: 'initial' },
    },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'surface',
        components: [
          { id: 'root', component: 'Probe', label: 'Before', value: { path: '/input' } },
        ],
      },
    },
  ] as A2uiMessage[]);
  const model = processor.model.getSurface('surface')!;
  render(<A2uiSurface surface={model} />);
  await screen.findByText('Before: initial');
  act(() => model.dataModel.set('/input', 'human entry'));
  await screen.findByText('Before: human entry');
  act(() =>
    processor.processMessages([
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: 'surface',
          components: [
            { id: 'root', component: 'Probe', label: 'After', value: { path: '/input' } },
          ],
        },
      },
    ] as A2uiMessage[]),
  );
  await screen.findByText('After: human entry');
  expect(model.dataModel.get('/input')).toBe('human entry');
});
