import type { Artifact } from '@clio/core/v3';
import { expect, it } from 'vitest';
import { sessionSources } from './observability-evidence-sources';

it('keeps a referenced artifact discoverable as an input without importing generated outputs', () => {
  const output: Artifact = {
    id: 'output',
    session_id: 's',
    name: 'report.docx',
    media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    uri: 'artifact://ws/report.docx@v1',
    session_relation: 'produced',
  };
  const input: Artifact = {
    ...output,
    id: 'input',
    name: 'source.docx',
    uri: 'artifact://ws/source.docx@v1',
    session_relation: 'used',
  };
  const sources = sessionSources([], [], [], undefined, [input, output]);
  expect(sources).toHaveLength(1);
  expect(sources[0]?.artifact).toEqual(input);
  expect(sources[0]?.label).toBe('source.docx');
});
