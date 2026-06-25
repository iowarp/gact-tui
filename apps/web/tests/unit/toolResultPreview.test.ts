import { describe, expect, it } from 'vitest';
import { analyzeToolResult, parseToolResult } from '../../src/components/toolResultPreview.js';

describe('parseToolResult', () => {
  it('parses JSON', () => {
    expect(parseToolResult('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses a Python-repr list with single quotes and True/None', () => {
    const v = parseToolResult("[{'name': 'x', 'ok': True, 'note': None}]");
    expect(v).toEqual([{ name: 'x', ok: true, note: null }]);
  });

  it('returns undefined for plain text', () => {
    expect(parseToolResult('just text')).toBeUndefined();
  });
});

describe('analyzeToolResult — semantic previews (real clio shapes)', () => {
  it('geocode → resolved place + coordinates, not raw repr', () => {
    const raw =
      "[{'display_name': 'Los Angeles, Los Angeles County, California, United States', 'lat': 34.0536909, 'lon': -118.242766, 'type': 'administrative'}]";
    const a = analyzeToolResult('geo_geocode', raw);
    expect(a.preview).toContain('Los Angeles');
    expect(a.preview).toContain('34.0536909');
    expect(a.preview).not.toContain('display_name');
    expect(a.imagePath).toBeUndefined();
  });

  it('CSV profile → columns + size, not the whole JSON', () => {
    const raw = JSON.stringify({
      success: true,
      file_path: '/tmp/x/MTA1.CI.LY_.30.csv',
      size_bytes: 50424246,
      columns: ['time', 'east', 'north', 'up', 'sigEE'],
      column_count: 8,
    });
    const a = analyzeToolResult('pandas_profile_csv', raw);
    expect(a.preview).toContain('8 columns');
    expect(a.preview).toContain('MB');
    expect(a.preview).toContain('time, east, north');
  });

  it('shell → stdout OUTPUT, never the echoed command', () => {
    const raw = JSON.stringify({
      command: "head -5 '/tmp/x/clean.csv'",
      exit_code: 0,
      stdout: 'Site,Latitude,(deg)\n7ODM,34.11,-117.09\nACSB,33.27,-117.44\n',
      stderr: '',
    });
    const a = analyzeToolResult('shell_bash', raw);
    expect(a.preview).toContain('Site,Latitude');
    expect(a.preview).toContain('7ODM');
    expect(a.preview).not.toContain('head -5');
  });

  it('shell with no output reports exit status, not the command', () => {
    const raw = JSON.stringify({ command: "cut -d, ...", exit_code: 0, stdout: '', stderr: '' });
    const a = analyzeToolResult('shell_bash', raw);
    expect(a.preview).toMatch(/no output|exit 0/i);
    expect(a.preview).not.toContain('cut -d,');
  });

  it('staged resource → file name + size', () => {
    const raw = JSON.stringify({
      ok: true,
      local_path: '/tmp/x/MTA1.CI.LY_.30.csv',
      size_bytes: 50424246,
      content_type: 'text/csv',
    });
    const a = analyzeToolResult('ndp_stage_resource', raw);
    expect(a.preview).toContain('MTA1.CI.LY_.30.csv');
    expect(a.preview).toContain('MB');
  });

  it('radius filter → matched / total counts', () => {
    const raw = JSON.stringify({
      ok: true,
      count: 155,
      within_radius_count: 155,
      total_points: 1101,
      radius_km: 100,
    });
    const a = analyzeToolResult('geo_filter_points_by_radius', raw);
    expect(a.preview).toContain('155');
    expect(a.preview).toContain('1101');
  });

  it('unwraps a {preview, truncated} envelope and analyses the inner result', () => {
    const inner = JSON.stringify({ within_radius_count: 155, total_points: 1101, radius_km: 100 });
    const raw = JSON.stringify({ preview: inner, truncated: true, original_chars: 14034 });
    const a = analyzeToolResult('geo_filter_points_by_radius', raw);
    expect(a.preview).toContain('155');
    expect(a.preview).toContain('1101');
  });

  it('dataset search → count + first title', () => {
    const raw = JSON.stringify({
      datasets: [
        { id: '1', name: 'mta1', title: 'MTA1.CI.LY_.30' },
        { id: '2', name: 'other', title: 'Other' },
      ],
    });
    const a = analyzeToolResult('ndp_search_datasets', raw);
    expect(a.preview).toContain('2 datasets');
    expect(a.preview).toContain('MTA1.CI.LY_.30');
  });

  it('plot → output file name AND exposes the image path for inline render', () => {
    const raw = JSON.stringify({
      status: 'success',
      plot_type: 'timeseries',
      output_path: '/tmp/x/MTA1_GNSS_timeseries_displacement.png',
      title: 'MTA1 GNSS Ground-Motion',
      data_points: 5000,
    });
    const a = analyzeToolResult('plot_plot_timeseries', raw);
    expect(a.preview).toContain('MTA1_GNSS_timeseries_displacement.png');
    expect(a.imagePath).toBe('/tmp/x/MTA1_GNSS_timeseries_displacement.png');
  });

  it('non-image output_path does NOT set imagePath', () => {
    const raw = JSON.stringify({ status: 'success', output_path: '/tmp/x/report.csv' });
    const a = analyzeToolResult('export_csv', raw);
    expect(a.imagePath).toBeUndefined();
  });

  it('keeps the full pretty-printed body for the expand affordance', () => {
    const raw = JSON.stringify({ within_radius_count: 1, total_points: 2, radius_km: 5 });
    const a = analyzeToolResult('geo_filter_points_by_radius', raw);
    expect(a.full).toContain('within_radius_count');
    expect(a.full).toContain('\n'); // pretty-printed
  });
});
