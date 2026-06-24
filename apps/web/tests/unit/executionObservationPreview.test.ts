import { describe, expect, it } from 'vitest';
import { observationPreview } from '../../src/components/executionObservationPreview.js';

describe('observationPreview', () => {
  it('summarizes geocode observations from raw text', () => {
    expect(
      observationPreview(
        'geo_geocode',
        '{"display_name":"San Diego, California","lat":32.7174202,"lon":-117.162772}',
      ),
    ).toBe('San Diego, California\ncenter 32.7174202, -117.162772');
  });

  it('summarizes NDP search and stage observations', () => {
    expect(
      observationPreview('ndp_search_datasets', 'found resource earthscope_converted_data.csv'),
    ).toBe('earthscope_converted_data.csv');
    expect(
      observationPreview('ndp_stage_resource', {
        local_path: '/tmp/earthscope_converted_data.csv',
        size_bytes: 153082,
      }),
    ).toBe('earthscope_converted_data.csv · 153082 bytes');
  });

  it('summarizes station filtering observations with a bounded preview', () => {
    expect(
      observationPreview('filter_points_by_radius', {
        within_radius_count: 4,
        points: [
          { Site: 'P475', distance_km: 9.483 },
          { Site: 'SIO5', distance_km: 15.94 },
          { Site: 'P472', distance_km: 19.86 },
          { Site: 'P473', distance_km: 20.03 },
        ],
      }),
    ).toBe('4 stations within radius\nP475 9.48 km\nSIO5 15.94 km\nP472 19.86 km\nshow full output');
  });

  it('summarizes shell redirects and plot artifacts', () => {
    expect(
      observationPreview('shell_bash', {
        command: 'cut -d, -f1,2,3 earthscope_converted_data.csv > earthscope_stations_clean.csv',
      }),
    ).toBe('prepared earthscope_stations_clean.csv');
    expect(
      observationPreview('plot_timeseries', {
        output_path: '/tmp/station_axis.png',
        plot_type: 'line',
        x_column: 'time',
        y_columns: ['east', 'north', 'up'],
        data_points: 128,
      }),
    ).toBe('/tmp/station_axis.png\nchart line\nx time\ny east, north, up\n128 rows');
  });

  it('hides empty, done, and redacted observations', () => {
    expect(observationPreview('tool', '')).toBe('');
    expect(observationPreview('tool', 'done')).toBe('');
    expect(observationPreview('tool', '[redacted]')).toBe('');
  });
});
