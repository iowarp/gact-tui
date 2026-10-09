import type { Artifact } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { artifactCategory, fileCategory, filterArtifacts } from './artifact-categories';

const artifact = (name: string, media_type = 'application/octet-stream'): Artifact => ({
  id: name,
  name,
  media_type,
  session_id: 'session',
  uri: `artifact://${name}`,
});

describe('artifact categories', () => {
  it.each([
    ['collect_sweep.py', 'scripts'],
    ['run.PS1', 'scripts'],
    ['analysis.ipynb', 'scripts'],
    ['optimized_iso0.5.glb', 'models'],
    ['surface.STL', 'models'],
    ['plot.png', 'images'],
    ['talk.pptx', 'slides'],
    ['talk.odp', 'slides'],
    ['sweep-compare.json', 'data'],
    ['measurements.parquet', 'data'],
    ['sweep_summary.md', 'documents'],
    ['report.pdf', 'documents'],
    ['outputs.zip', 'other'],
  ] as const)('classifies %s even when the MIME type is generic', (name, category) => {
    expect(artifactCategory(artifact(name))).toBe(category);
  });

  it('uses MIME types for extensionless artifacts', () => {
    expect(fileCategory('plot', 'IMAGE/PNG; charset=utf-8')).toBe('images');
    expect(fileCategory('model', 'model/gltf-binary')).toBe('models');
    expect(
      fileCategory(
        'slides',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ),
    ).toBe('slides');
  });

  it('recognizes recorded and legacy plans without misclassifying scripts', () => {
    expect(
      artifactCategory({ ...artifact('proposal.md'), producer: { designation: 'plan' } }),
    ).toBe('plans');
    expect(artifactCategory(artifact('plan-sweep.md'))).toBe('plans');
    expect(artifactCategory(artifact('plan_sweep.py'))).toBe('scripts');
  });

  it('combines search and category while retaining original artifact identity and order', () => {
    const script = artifact('collect_SWEEP.py');
    const records = [artifact('plot.png'), script, artifact('sweep.json'), artifact('other.py')];
    expect(filterArtifacts(records, ' sweep ', 'scripts')).toEqual([script]);
    expect(filterArtifacts(records, 'sweep', 'scripts')[0]).toBe(script);
    expect(filterArtifacts(records, '', 'all')).toEqual(records);
    expect(filterArtifacts(records, 'png', 'models')).toEqual([]);
  });
});
