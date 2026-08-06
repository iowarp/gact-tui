/**
 * Owner defect A1: FilesLayer parsed the workspace file-read route's body as
 * JSON ("Could not read file: Unexpected token 'S', \"Site,Latit\"... is not
 * valid JSON"), but the route
 * (clio-agent routes/workspaces.py::read_workspace_file) serves text files
 * decoded raw and binary files as raw bytes with a real content type —
 * never a JSON envelope. These cases pin the decoder that replaced the
 * JSON-parsing read: raw text stays raw text (never run through JSON.parse),
 * CSV becomes a bounded table, and non-text media types become an honest
 * "binary" notice instead of an attempted (corrupting) UTF-8 decode.
 */
import { describe, expect, it } from 'vitest';
import { base64ToUtf8, decodeWorkspaceFilePreview, splitFrontmatter } from '../../src/session/filePreview';

function toBase64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

describe('base64ToUtf8', () => {
  it('round-trips UTF-8 text, including multi-byte characters', () => {
    const text = 'Site,Latitude\nLA,34.05°N — café';
    expect(base64ToUtf8(toBase64(text))).toBe(text);
  });
});

describe('decodeWorkspaceFilePreview', () => {
  it('a raw CSV body — the exact live defect — decodes as a table, never attempts JSON.parse', () => {
    const csv = 'Site,Latitude\nMTA1,34.05\nP123,33.66\n';
    const result = decodeWorkspaceFilePreview(
      { data: toBase64(csv), media_type: 'text/csv', size: csv.length },
      'earthscope_stations_clean.csv',
    );
    expect(result).toEqual({
      kind: 'csv',
      header: ['Site', 'Latitude'],
      rows: [
        ['MTA1', '34.05'],
        ['P123', '33.66'],
      ],
      totalRows: 2,
    });
  });

  it('infers CSV from the .csv extension even when media_type is generic text/plain', () => {
    const csv = 'a,b\n1,2\n';
    const result = decodeWorkspaceFilePreview(
      { data: toBase64(csv), media_type: 'text/plain', size: csv.length },
      'data.csv',
    );
    expect(result.kind).toBe('csv');
  });

  it('a plain-text (non-CSV) file stays raw text — never JSON-parsed', () => {
    const body = '{not actually json, just text that starts with a brace}';
    const result = decodeWorkspaceFilePreview(
      { data: toBase64(body), media_type: 'text/x-python', size: body.length },
      'notes.py',
    );
    expect(result).toEqual({ kind: 'text', text: body });
  });

  it('application/json media type still renders as text, not a parsed object', () => {
    const body = '{"a": 1}';
    const result = decodeWorkspaceFilePreview(
      { data: toBase64(body), media_type: 'application/json', size: body.length },
      'config.json',
    );
    expect(result).toEqual({ kind: 'text', text: body });
  });

  it('a binary media type never decodes bytes as text — honest notice with size + media type', () => {
    const result = decodeWorkspaceFilePreview(
      { data: 'not-valid-utf8-does-not-matter', media_type: 'application/octet-stream', size: 4096 },
      'artifact.bin',
    );
    expect(result).toEqual({ kind: 'binary', size: 4096, mediaType: 'application/octet-stream' });
  });

  it('image media types decode as an inline data URI, not a binary notice or text', () => {
    const result = decodeWorkspaceFilePreview(
      { data: 'iVBORw0KGgo=', media_type: 'image/png', size: 8 },
      'plot.png',
    );
    expect(result).toEqual({ kind: 'image', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
  });

  it('caps CSV preview rows but keeps the honest total row count', () => {
    const lines = ['h1,h2', ...Array.from({ length: 500 }, (_, i) => `${i},${i}`)];
    const csv = lines.join('\n');
    const result = decodeWorkspaceFilePreview(
      { data: toBase64(csv), media_type: 'text/csv', size: csv.length },
      'big.csv',
    );
    expect(result.kind).toBe('csv');
    if (result.kind === 'csv') {
      expect(result.rows.length).toBe(200);
      expect(result.totalRows).toBe(500);
    }
  });
});

/**
 * Round-7 finding: the blueprint explorer renders `experts/main.md` through
 * the markdown lane, but its leading YAML frontmatter (`---\nid: main\n...`)
 * — which itself contains `# comment` lines that collide with the shared
 * Markdown module's heading token — leaked into the parsed body instead of
 * being split off. These cases pin the split in isolation from the render.
 */
describe('splitFrontmatter', () => {
  it('splits a real blueprint expert file: frontmatter (including internal # comments) separate from the body', () => {
    const text = [
      '---',
      'id: main',
      'title: EarthScope GNSS Region Orchestrator',
      'tier: 1',
      '# Small-model-friendly pack: the four leaves proved solid under Haiku.',
      'default_model: sonnet',
      '---',
      '',
      '# EarthScope GNSS Region Orchestrator',
      '',
      'You are the orchestrator.',
    ].join('\n');
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toBe(
      [
        'id: main',
        'title: EarthScope GNSS Region Orchestrator',
        'tier: 1',
        '# Small-model-friendly pack: the four leaves proved solid under Haiku.',
        'default_model: sonnet',
      ].join('\n'),
    );
    expect(result.body).toBe(['', '# EarthScope GNSS Region Orchestrator', '', 'You are the orchestrator.'].join('\n'));
    // Neither delimiter line survives into either half.
    expect(result.frontmatter).not.toContain('---');
    expect(result.body).not.toContain('---');
  });

  it('a file with no frontmatter is returned unchanged as the body', () => {
    const text = '# Root Expert\n\nDrives sub-agent routing.';
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it('an opening --- with no matching close is left alone, not guessed at', () => {
    const text = '---\nsome text that never closes the block\n\nmore text';
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it('a bare --- that is really a horizontal rule (no frontmatter keys before it) still splits honestly, never eaten as body loss', () => {
    // Even this degenerate case must never DROP content — the two halves
    // rejoined (with delimiters) reconstruct the original substance.
    const text = '---\n---\n\nBody after an empty frontmatter block.';
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toBe('');
    expect(result.body).toBe('\nBody after an empty frontmatter block.');
  });
});
