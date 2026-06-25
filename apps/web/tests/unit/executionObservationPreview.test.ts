import { describe, expect, it } from 'vitest';
import { observationPreview } from '../../src/components/executionObservationPreview.js';

// observationPreview is BACKEND-AGNOSTIC: it renders by content type, never by
// the tool's name (the first arg is ignored for special-casing).
describe('observationPreview — by content type', () => {
  it('summarises a structured JSON observation generically', () => {
    const out = observationPreview(
      'anything',
      '{"display_name":"San Diego, California","lat":32.7174202,"lon":-117.162772}',
    );
    expect(out).toContain('San Diego');
  });

  it('renders an image observation with an inline hint', () => {
    const out = observationPreview('anything', { output_path: '/tmp/station_axis.png' });
    expect(out).toContain('/tmp/station_axis.png');
    expect(out).toContain('show full image');
  });

  it('renders a CSV table observation as columns + sample rows', () => {
    const out = observationPreview(
      'anything',
      'Site,distance_km\nP475,9.483\nSIO5,15.94\nP472,19.86\n',
    );
    expect(out).toContain('Site');
    expect(out).toContain('distance_km');
    expect(out).toContain('show full output');
  });

  it('hides empty, done, and redacted observations', () => {
    expect(observationPreview('tool', '')).toBe('');
    expect(observationPreview('tool', 'done')).toBe('');
    expect(observationPreview('tool', '[redacted]')).toBe('');
  });
});
