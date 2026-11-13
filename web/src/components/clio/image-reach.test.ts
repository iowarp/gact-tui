import type { ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { imageReach, reachSummary, workspaceImages } from './image-reach';
import { parsePrintedValue } from './python-literal';

function view(overrides: Partial<ToolInvocation> = {}): ToolInvocation {
  return {
    id: 'v',
    session_id: 's',
    name: 'view_image',
    state: 'succeeded',
    started_at: '2026-11-01T00:00:00Z',
    input: { path: 'page-1.png' },
    ...overrides,
  };
}

describe('imageReach', () => {
  it('says shown when the agent attached the pixels (clio-agent #2272)', () => {
    const direct = imageReach(
      view({ output: { attached_to_model: true, delivery: 'tool_result' } }),
    );
    expect(direct).toMatchObject({ state: 'shown', label: 'Shown to the model' });
    expect(direct?.detail).toMatch(/as this call’s result/u);
    const scripted = imageReach(
      view({
        parent_call_id: 'run',
        output: { attached_to_model: true, delivery: 'script_result' },
      }),
    );
    expect(scripted?.detail).toMatch(/run_code script’s result/u);
  });

  it('prefers the block’s own sentence', () => {
    const reach = imageReach(
      view({
        presentation: {
          blocks: [
            {
              type: 'workspace_file',
              id: 'image',
              path: 'page-1.png',
              status: 'attached_to_model',
              detail: 'Shown to the model on its next step.',
            },
          ],
        },
      } as Partial<ToolInvocation>),
    );
    expect(reach).toMatchObject({ state: 'shown', detail: 'Shown to the model on its next step.' });
  });

  it.each([
    [{ output: { error: { reason: 'view_image_not_shown' } } }, /background script/u],
    [{ output: { reason: 'view_pdf_script_limit' }, name: 'view_pdf' }, /as many files/u],
    [{ error: 'The image was NOT shown to the model.' }, /background script/u],
  ])('says not shown for a refused view', (overrides, detail) => {
    const reach = imageReach(view({ state: 'failed', ...overrides } as Partial<ToolInvocation>));
    expect(reach).toMatchObject({ state: 'not-shown', label: 'Not shown to the model' });
    expect(reach?.detail).toMatch(detail);
  });

  it('never says seen for an agent without the report', () => {
    expect(imageReach(view())).toMatchObject({ state: 'unconfirmed', label: 'Not confirmed' });
    expect(imageReach(view({ parent_call_id: 'run' }))?.detail).toMatch(/not its pixels/u);
    expect(imageReach(view({ state: 'failed', error: 'file not found' }))).toBeUndefined();
    expect(imageReach(view({ name: 'fs_read_file' }))).toBeUndefined();
  });
});

describe('reachSummary', () => {
  const at = (state: 'shown' | 'not-shown' | 'unconfirmed') => ({ state, label: '', detail: '' });
  it('says one phrase for all views', () => {
    expect(reachSummary([])).toBeUndefined();
    expect(reachSummary([at('shown'), at('shown')])).toBe('shown to the model');
    expect(reachSummary([at('unconfirmed')])).toBe('not confirmed as seen');
    expect(reachSummary([at('shown'), at('unconfirmed'), at('not-shown')])).toBe(
      '1 of 3 shown to the model',
    );
    expect(reachSummary([at('unconfirmed'), at('not-shown')])).toBe(
      '1 of 2 not shown to the model',
    );
  });
});

describe('a script’s printed result', () => {
  it('reads a Python repr as data and keeps prose as text', () => {
    expect(
      parsePrintedValue(
        "[{'type': 'clio.workspace_image.v1', 'path': 'p.png', 'size_bytes': 10, 'ok': True, 'x': None}]",
      ),
    ).toEqual({
      value: [
        { type: 'clio.workspace_image.v1', path: 'p.png', size_bytes: 10, ok: true, x: null },
      ],
    });
    expect(parsePrintedValue('{"a": [1, 2.5e3]}')).toEqual({ value: { a: [1, 2500] } });
    expect(parsePrintedValue("('a\\n', r'\\d', -1,)")).toEqual({ value: ['a\n', '\\d', -1] });
    expect(parsePrintedValue('Traceback (most recent call last):')).toBeUndefined();
    expect(parsePrintedValue('{<object at 0x1>}')).toBeUndefined();
    expect(parsePrintedValue('done')).toBeUndefined();
  });

  it('finds image descriptors only when the value is nothing else', () => {
    const image = { type: 'clio.workspace_image.v1', path: 'p.png', media_type: 'image/png' };
    expect(workspaceImages([image, image])).toHaveLength(2);
    expect(workspaceImages(image)?.[0]).toMatchObject({ path: 'p.png', mediaType: 'image/png' });
    expect(workspaceImages([image, { path: 'x' }])).toBeUndefined();
    expect(workspaceImages([])).toBeUndefined();
  });
});
