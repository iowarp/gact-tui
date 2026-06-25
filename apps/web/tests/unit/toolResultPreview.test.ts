import { describe, expect, it } from 'vitest';
import { analyzeToolResult } from '../../src/components/toolResultPreview.js';
import {
  detectToolResultContent,
  parseStructured,
} from '../../src/components/toolResultContent.js';

describe('parseStructured', () => {
  it('parses JSON', () => {
    expect(parseStructured('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses a Python-repr list with single quotes and True/None', () => {
    const v = parseStructured("[{'name': 'x', 'ok': True, 'note': None}]");
    expect(v).toEqual([{ name: 'x', ok: true, note: null }]);
  });

  it('returns undefined for plain text', () => {
    expect(parseStructured('just text')).toBeUndefined();
  });
});

describe('detectToolResultContent — by CONTENT, never by tool name', () => {
  it('detects an image from an output_path with an image extension', () => {
    const raw = JSON.stringify({
      status: 'success',
      output_path: '/tmp/x/MTA1_displacement.png',
      title: 'MTA1 GNSS',
      data_points: 5000,
    });
    const c = detectToolResultContent(raw);
    expect(c.kind).toBe('image');
    if (c.kind === 'image') expect(c.path).toBe('/tmp/x/MTA1_displacement.png');
  });

  it('a non-image output_path is NOT an image', () => {
    const c = detectToolResultContent(JSON.stringify({ output_path: '/tmp/x/report.csv' }));
    expect(c.kind).not.toBe('image');
  });

  it('detects a table from a profile carrying columns[] + dtypes + row_count', () => {
    const raw = JSON.stringify({
      success: true,
      file_path: '/tmp/x/MTA1.csv',
      columns: ['time', 'east', 'north', 'up'],
      dtypes: { time: 'integer', east: 'float', north: 'float', up: 'float' },
      row_count: 250000,
    });
    const c = detectToolResultContent(raw);
    expect(c.kind).toBe('table');
    if (c.kind === 'table') {
      expect(c.columns.map((col) => col.name)).toEqual(['time', 'east', 'north', 'up']);
      expect(c.columns[0]?.dtype).toBe('integer');
      expect(c.rowCount).toBe(250000);
    }
  });

  it('detects a table from delimited CSV text (header + rows)', () => {
    const raw = 'Site,Latitude,Longitude\n7ODM,34.11,-117.09\nACSB,33.27,-117.44\n';
    const c = detectToolResultContent(raw);
    expect(c.kind).toBe('table');
    if (c.kind === 'table') {
      expect(c.columns.map((col) => col.name)).toEqual(['Site', 'Latitude', 'Longitude']);
      expect(c.rows[0]).toEqual(['7ODM', '34.11', '-117.09']);
    }
  });

  it('detects a unified diff from a unified_diff field', () => {
    const diff = '--- a/x.txt\n+++ b/x.txt\n@@ -1,2 +1,2 @@\n-old\n+new\n ctx\n';
    const c = detectToolResultContent(JSON.stringify({ unified_diff: diff }));
    expect(c.kind).toBe('diff');
  });

  it('detects a unified diff from raw diff text', () => {
    const diff = '@@ -1,3 +1,3 @@\n-a\n+b\n c\n';
    const c = detectToolResultContent(diff);
    expect(c.kind).toBe('diff');
  });

  it('a structured array surfaces as json with a generic preview', () => {
    const raw =
      "[{'display_name': 'Los Angeles, California', 'lat': 34.0536909, 'lon': -118.242766}]";
    const c = detectToolResultContent(raw);
    expect(c.kind).toBe('json');
  });

  it('unwraps a {preview, truncated} envelope and detects the inner content', () => {
    const inner = 'Site,Latitude\nMTA1,34.05\nPKRD,34.07\n';
    const raw = JSON.stringify({ preview: inner, truncated: true });
    const c = detectToolResultContent(raw);
    expect(c.kind).toBe('table');
  });

  it('shell stdout body is detected by its content (a CSV table here)', () => {
    const raw = JSON.stringify({
      command: "head -3 '/tmp/x/clean.csv'",
      exit_code: 0,
      stdout: 'Site,Latitude,Longitude\n7ODM,34.11,-117.09\nACSB,33.27,-117.44\n',
      stderr: '',
    });
    const c = detectToolResultContent(raw);
    expect(c.kind).toBe('table');
  });

  it('prose with markdown structure surfaces as markdown', () => {
    const raw = '**Los Angeles Region**\n\n- Center: 34.05, -118.24\n- Radius: 100 km';
    const c = detectToolResultContent(raw);
    expect(c.kind).toBe('markdown');
  });
});

describe('analyzeToolResult — preview + full body + image path', () => {
  it('image: preview is the file name, imagePath is set', () => {
    const raw = JSON.stringify({ output_path: '/tmp/x/MTA1_displacement.png', data_points: 5000 });
    const a = analyzeToolResult(raw);
    expect(a.preview).toContain('MTA1_displacement.png');
    expect(a.imagePath).toBe('/tmp/x/MTA1_displacement.png');
  });

  it('table: preview lists the column count + names', () => {
    const raw = JSON.stringify({ columns: ['time', 'east', 'north'], row_count: 5000 });
    const a = analyzeToolResult(raw);
    expect(a.preview).toContain('3 columns');
    expect(a.preview).toContain('time, east, north');
    expect(a.imagePath).toBeUndefined();
  });

  it('keeps the full pretty-printed body for the expand affordance', () => {
    const raw = JSON.stringify({ count: 1, total: 2, radius_km: 5 });
    const a = analyzeToolResult(raw);
    expect(a.full).toContain('count');
    expect(a.full).toContain('\n'); // pretty-printed
  });
});
