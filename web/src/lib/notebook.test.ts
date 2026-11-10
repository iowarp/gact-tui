import { describe, expect, it } from 'vitest';
import { plainTerminalText, readNotebook } from './notebook';
import { textFileFormat } from './file-presentation';

const notebook = (cells: unknown[], metadata: unknown = {}) =>
  JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata, cells });

describe('readNotebook', () => {
  it('reads markdown, code and raw cells with their run counts and kernel', () => {
    const read = readNotebook(
      notebook(
        [
          { cell_type: 'markdown', source: ['# Title\n', 'Body'] },
          { cell_type: 'code', execution_count: 3, source: 'x = 1', outputs: [] },
          { cell_type: 'code', execution_count: null, source: [], outputs: [] },
          { cell_type: 'raw', source: 'raw text' },
        ],
        {
          kernelspec: { display_name: 'Julia 1.10', language: 'julia' },
          language_info: { name: 'julia' },
        },
      ),
    );
    expect(read).toEqual({
      ok: true,
      notebook: {
        kernel: 'Julia 1.10',
        language: 'julia',
        cells: [
          { kind: 'markdown', source: '# Title\nBody' },
          { kind: 'code', source: 'x = 1', count: 3, outputs: [] },
          { kind: 'code', source: '', count: null, outputs: [] },
          { kind: 'raw', source: 'raw text' },
        ],
      },
    });
  });

  it('prefers HTML, then images, then plain text, and merges stream chunks', () => {
    const read = readNotebook(
      notebook([
        {
          cell_type: 'code',
          execution_count: 1,
          source: '',
          outputs: [
            { output_type: 'stream', name: 'stdout', text: ['a', 'b\n'] },
            { output_type: 'stream', name: 'stdout', text: 'c\n' },
            { output_type: 'stream', name: 'stderr', text: 'warn\n' },
            { output_type: 'execute_result', data: { 'text/html': '<b>x</b>', 'text/plain': 'x' } },
            {
              output_type: 'display_data',
              data: { 'image/png': 'iVBO\nRw==', 'text/plain': '<Figure size 640x480>' },
            },
            {
              output_type: 'display_data',
              data: { 'text/html': '<div id="w"></div><script>w()</script>', 'text/plain': 'W' },
            },
          ],
        },
      ]),
    );
    if (!read.ok || read.notebook.cells[0].kind !== 'code') throw new Error('not read');
    expect(read.notebook.language).toBe('python');
    expect(read.notebook.cells[0].outputs).toEqual([
      { kind: 'stream', stream: 'stdout', text: 'ab\nc' },
      { kind: 'stream', stream: 'stderr', text: 'warn' },
      { kind: 'html', html: '<b>x</b>' },
      { kind: 'image', src: 'data:image/png;base64,iVBORw==', alt: 'Figure from cell 1' },
      { kind: 'text', text: 'W' },
    ]);
  });

  it('drops a pandas table’s scoped style so its rules never show as text', () => {
    const html = [
      '<div>',
      '<style scoped>',
      '    .dataframe tbody tr th:only-of-type { vertical-align: middle; }',
      '</style>',
      '<table border="1" class="dataframe"><tr><th>station</th></tr><tr><td>P395</td></tr></table>',
      '</div>',
    ];
    const read = readNotebook(
      notebook([
        {
          cell_type: 'code',
          execution_count: 1,
          source: 'summary',
          outputs: [
            {
              output_type: 'execute_result',
              data: { 'text/html': html, 'text/plain': '  station\n0    P395' },
            },
          ],
        },
      ]),
    );
    if (!read.ok || read.notebook.cells[0].kind !== 'code') throw new Error('not read');
    const [output] = read.notebook.cells[0].outputs;
    expect(output.kind).toBe('html');
    if (output.kind !== 'html') return;
    expect(output.html).not.toContain('vertical-align');
    expect(output.html).toContain('<td>P395</td>');
  });

  it('keeps an error’s name and value and strips colour from its traceback', () => {
    const read = readNotebook(
      notebook([
        {
          cell_type: 'code',
          execution_count: 2,
          source: '1/0',
          outputs: [
            {
              output_type: 'error',
              ename: 'ZeroDivisionError',
              evalue: 'division by zero',
              traceback: ['\u001b[0;31mZeroDivisionError\u001b[0m: division by zero'],
            },
          ],
        },
      ]),
    );
    if (!read.ok || read.notebook.cells[0].kind !== 'code') throw new Error('not read');
    expect(read.notebook.cells[0].outputs).toEqual([
      {
        kind: 'error',
        name: 'ZeroDivisionError',
        value: 'division by zero',
        traceback: 'ZeroDivisionError: division by zero',
      },
    ]);
  });

  it('inlines a markdown cell’s pasted image', () => {
    const read = readNotebook(
      notebook([
        {
          cell_type: 'markdown',
          source: '![map](attachment:map.png)',
          attachments: { 'map.png': { 'image/png': 'AAAA' } },
        },
      ]),
    );
    expect(read.ok && read.notebook.cells[0].source).toBe('![map](data:image/png;base64,AAAA)');
  });

  it('says why a file is not a readable notebook', () => {
    expect(readNotebook('{"cells": [')).toEqual({
      ok: false,
      reason: 'The file isn’t complete JSON.',
    });
    expect(readNotebook('{"worksheets": []}')).toMatchObject({ ok: false, reason: /version 3/u });
    expect(readNotebook('{"metadata": {}}')).toEqual({
      ok: false,
      reason: 'The file has no cells.',
    });
  });
});

describe('plainTerminalText', () => {
  it('keeps the last redraw of a progress line', () => {
    expect(plainTerminalText('10%\r50%\r100%\ndone')).toBe('100%\ndone');
  });
});

describe('textFileFormat', () => {
  it('reads .ipynb files and the Jupyter media type as notebooks', () => {
    expect(textFileFormat('analysis.ipynb')).toBe('notebook');
    expect(textFileFormat('download', 'application/x-ipynb+json')).toBe('notebook');
    expect(textFileFormat('data.json')).toBe('json');
  });
});
