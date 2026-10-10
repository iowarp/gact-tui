import type { Artifact } from '@clio/core/v3';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtifactTypeIcon } from '@/components/clio/artifact-type-icon';
import { artifactDisplayName, isDashboardArtifact } from './dashboard-presentation';

const artifact: Artifact = {
  id: 'saved',
  session_id: 'session',
  name: 'c8f1f7f8.dashboard.json',
  uri: 'artifact://saved',
  media_type: 'application/json',
  producer: { designation: 'dashboard-report', title: 'Morning bike availability' },
};

describe('dashboard presentation', () => {
  it('uses a saved report title and dashboard icon for legacy random filenames', () => {
    expect(artifactDisplayName(artifact)).toBe('Morning bike availability');
    const { container } = render(<ArtifactTypeIcon artifact={artifact} />);
    expect(container.querySelector('svg')).toHaveClass('lucide-layout-dashboard');
  });

  it('keeps an ordinary JSON file and exported HTML distinct from a dashboard', () => {
    for (const designation of ['file', 'dashboard-export']) {
      const file = { ...artifact, producer: { designation, title: 'Not a report' } };
      expect(isDashboardArtifact(file)).toBe(false);
      expect(artifactDisplayName(file)).toBe(file.name);
    }
    expect(
      artifactDisplayName({
        ...artifact,
        producer: { designation: 'dashboard-report', title: '  ' },
      }),
    ).toBe(artifact.name);
  });
});
