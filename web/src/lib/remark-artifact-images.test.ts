import { describe, expect, it } from 'vitest';
import { ARTIFACT_IMAGE_PATH, remarkArtifactImages } from './remark-artifact-images';

function image(url: string) {
  const tree = { type: 'root', children: [{ type: 'image', url }] };
  remarkArtifactImages()(tree);
  return tree.children[0]!.url;
}

describe('remarkArtifactImages', () => {
  it('routes artifact and plugin-asset images to the local component', () => {
    expect(image('artifact://artifact_abc')).toBe(
      `${ARTIFACT_IMAGE_PATH}${encodeURIComponent('artifact://artifact_abc')}`,
    );
    const capture = 'plugin-asset://guide/captures/docs-agent-plugins.webp';
    expect(image(capture)).toBe(`${ARTIFACT_IMAGE_PATH}${encodeURIComponent(capture)}`);
  });

  it('leaves other images to the generic sanitizer', () => {
    expect(image('https://example.org/a.png')).toBe('https://example.org/a.png');
  });
});
