import { describe, expect, it } from 'vitest';
import {
  inlineReferenceSegments,
  inlinedReferenceIds,
  type ContextReferenceBlock,
} from './sent-inline-references';

function reference(id: string, refId: string, label: string, kind = 'workspace_file') {
  return {
    id,
    type: 'context_reference',
    ref_kind: kind,
    ref_id: refId,
    label,
    revision: 'v1',
    media_type: 'text/plain',
    navigation: {},
  } as ContextReferenceBlock;
}

describe('inline sent references', () => {
  const file = reference('a', 'data/run.h5', 'run.h5');
  const object = reference('b', 'data/run.h5::/entry/data', 'run.h5 › /entry/data');
  const artifact = reference('c', 'artifact_plot', 'Displacement plot', 'artifact');

  it('splits text at each mention, preferring the longest', () => {
    expect(
      inlineReferenceSegments('Compare @data/run.h5::/entry/data with @data/run.h5.', [
        file,
        object,
      ]),
    ).toEqual([
      { kind: 'text', text: 'Compare ' },
      { kind: 'reference', block: object },
      { kind: 'text', text: ' with ' },
      { kind: 'reference', block: file },
      { kind: 'text', text: '.' },
    ]);
  });

  it('names a non-file reference by its label and leaves other @ text alone', () => {
    expect(inlineReferenceSegments('mail me@x.org about @Displacement plot', [artifact])).toEqual([
      { kind: 'text', text: 'mail me@x.org about ' },
      { kind: 'reference', block: artifact },
    ]);
  });

  it('reports only the references the text shows', () => {
    expect(inlinedReferenceIds(['see @data/run.h5'], [file, artifact])).toEqual(new Set(['a']));
    expect(inlineReferenceSegments('no mentions', [file])).toEqual([
      { kind: 'text', text: 'no mentions' },
    ]);
  });
});
