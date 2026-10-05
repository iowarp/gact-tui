import { afterEach, describe, expect, it } from 'vitest';
import { imageAttentionRegion, structuredAttentionSelection } from './attention-selection-coordinates';

afterEach(() => { document.body.innerHTML = ''; });
describe('structured and image attention coordinates', () => {
  it('preserves typed stable source values and deduplicates independently of row order', () => {
    const query = { dataUri: 'artifact://dataset', selection: { field: 'id', values: [7, '7', 7, 'alpha'] } };
    const first = structuredAttentionSelection('surface', 'table', query);
    const reordered = structuredAttentionSelection('surface', 'table', { ...query, selection: { field: 'id', values: ['alpha', 7, '7'] } });
    expect(first).toEqual(reordered);
    expect(first.keys).toEqual(['["id","7"]', '["id","alpha"]', '["id",7]']);
    expect(first.source_ref).toBe('artifact://dataset');
    expect(() => structuredAttentionSelection('surface', 'table', { rows: [{ id: 1 }] })).toThrow(/Select up to/);
  });
  it('excludes letterboxing and rejects an empty pixel intersection', () => {
    const target = document.createElement('div'); const image = document.createElement('img');
    target.append(image); document.body.append(target);
    target.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
    image.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
    Object.defineProperties(image, { naturalWidth: { value: 800 }, naturalHeight: { value: 400 } });
    image.style.objectFit = 'contain'; image.style.objectPosition = '50% 50%';
    expect(imageAttentionRegion(image, target, { x: .25, y: .25, width: .5, height: .5 })).toEqual({ kind: 'image_region', x: .25, y: 0, width: .5, height: 1 });
    expect(() => imageAttentionRegion(image, target, { x: 0, y: 0, width: .5, height: .1 })).toThrow(/inside the image/);
    image.style.objectFit = 'cover';
    expect(imageAttentionRegion(image, target, { x: 0, y: 0, width: 1, height: 1 })).toEqual({ kind: 'image_region', x: .25, y: 0, width: .5, height: 1 });
  });
});
