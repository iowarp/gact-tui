import {describe, expect, it} from 'vitest';
import {galleryComponentFromHash, galleryComponentSlug} from './gallery-component-links';

const names = ['clio.map.v1', 'clio.chart.v1', 'clio.mesh-viewport.v1', 'clio.slider.v1', 'Slider', 'TextField'];
describe('gallery component links', () => {
  it('opens canonical, case-insensitive and component-name anchors', () => {
    expect(galleryComponentFromHash('#map', names)).toBe('clio.map.v1');
    expect(galleryComponentFromHash('#Map', names)).toBe('clio.map.v1');
    expect(galleryComponentFromHash('#clio.map.v1', names)).toBe('clio.map.v1');
    expect(galleryComponentFromHash('#text-field', names)).toBe('TextField');
  });
  it('keeps both sliders uniquely addressable', () => {
    expect(galleryComponentSlug('Slider')).toBe('slider');
    expect(galleryComponentSlug('clio.slider.v1')).toBe('numeric-slider');
    expect(galleryComponentFromHash('#numeric-slider', names)).toBe('clio.slider.v1');
    expect(galleryComponentFromHash('#slider', names)).toBe('Slider');
    expect(new Set(names.map(galleryComponentSlug)).size).toBe(names.length);
  });
  it('ignores unrelated and malformed anchors', () => {
    expect(galleryComponentFromHash('#overview', names)).toBeUndefined();
    expect(galleryComponentFromHash('#%invalid', names)).toBeUndefined();
  });
});
