import { describe, expect, it } from 'vitest';
import { buildZoneReference } from './data-zone-reference';

describe('buildZoneReference', () => {
  it('names the component, dataset, filters, zone, a preview table, and the re-query JSON', () => {
    const { markdown, summary, title } = buildZoneReference({
      componentLabel: 'Depth vs. magnitude chart',
      datasetLabel: 'artifact_earthquakes01',
      filters: ['magnitude ≥ 2'],
      previewColumns: ['id', 'depth', 'magnitude'],
      previewRows: [
        { depth: 4.2, id: 'eq0342', magnitude: 6.1 },
        { depth: 5.1, id: 'eq0087', magnitude: 5.8 },
      ],
      query: {
        dataUri: 'artifact://artifact_earthquakes01',
        dataQuery: { filter: [{ column: 'depth', op: 'range', value: [2, 8] }] },
      },
      zoneDescription: 'depth 2–8 — 23 of 270 rows',
    });

    expect(title).toBe('Depth vs. magnitude chart');
    // A plain one-line summary — never markdown — for the composer chip
    // itself (#1533 coordinator review: the chip previously showed the full
    // markdown block flattened onto one line).
    expect(summary).toBe('depth 2–8 — 23 of 270 rows');
    expect(summary).not.toContain('**');
    expect(summary).not.toContain('|');
    expect(markdown).toContain('**Depth vs. magnitude chart** — artifact_earthquakes01');
    expect(markdown).toContain('Filters: magnitude ≥ 2.');
    expect(markdown).toContain('Zone: depth 2–8 — 23 of 270 rows.');
    expect(markdown).toContain('| id | depth | magnitude |');
    expect(markdown).toContain('| eq0342 | 4.2 | 6.1 |');
    expect(markdown).toContain('```json');
    expect(markdown).toContain('"op": "range"');
    expect(markdown).toContain('```');
  });

  it('omits the filters line and the preview table when there is nothing to show', () => {
    const { markdown } = buildZoneReference({
      componentLabel: 'Epicenters map',
      datasetLabel: 'artifact_earthquakes01',
      filters: [],
      previewColumns: [],
      previewRows: [],
      query: { dataUri: 'artifact://artifact_earthquakes01' },
      zoneDescription: '12 points in the rectangle',
    });

    expect(markdown).not.toContain('Filters:');
    expect(markdown).not.toContain('| ');
    expect(markdown).toContain('Zone: 12 points in the rectangle.');
  });

  it('escapes a pipe in a cell value so it cannot break the table', () => {
    const { markdown } = buildZoneReference({
      componentLabel: 'Earthquake table',
      datasetLabel: 'artifact_earthquakes01',
      filters: [],
      previewColumns: ['place'],
      previewRows: [{ place: 'North | South border' }],
      query: {},
      zoneDescription: '3 rows',
    });

    expect(markdown).toContain('North \\| South border');
  });

  it('renders null/undefined preview cells as blank, not the literal word', () => {
    const { markdown } = buildZoneReference({
      componentLabel: 'Earthquake table',
      datasetLabel: 'artifact_earthquakes01',
      filters: [],
      previewColumns: ['depth', 'place'],
      previewRows: [{ depth: null, place: undefined }],
      query: {},
      zoneDescription: '1 row',
    });

    expect(markdown).toContain('|  |  |');
    expect(markdown).not.toContain('null');
    expect(markdown).not.toContain('undefined');
  });
});
