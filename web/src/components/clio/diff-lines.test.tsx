import { describe, expect, it } from 'vitest';
import { diffRows } from './diff-lines';

describe('diffRows', () => {
  it('numbers lines by file, drops patch headers and marks hunks', () => {
    const rows = diffRows(
      [
        '--- a/run.sh',
        '+++ b/run.sh',
        '@@ -11,3 +11,3 @@ setup',
        ' module load hdf5',
        '-python regrid.py --all',
        '+python regrid.py --grid 0.25',
        ' srun -n 4 regrid.py',
        '\\ No newline at end of file',
        '',
      ].join('\n'),
    );
    expect(rows).toEqual([
      { kind: 'hunk', text: 'setup' },
      { kind: 'context', line: 11, text: 'module load hdf5' },
      { kind: 'deletion', line: 12, text: 'python regrid.py --all' },
      { kind: 'addition', line: 12, text: 'python regrid.py --grid 0.25' },
      { kind: 'context', line: 13, text: 'srun -n 4 regrid.py' },
    ]);
  });

  it('shows text without hunks as numbered lines', () => {
    expect(diffRows('a\nb')).toEqual([
      { kind: 'context', line: 1, text: 'a' },
      { kind: 'context', line: 2, text: 'b' },
    ]);
  });
});
