import { describe, expect, it } from 'vitest';
import type { Artifact } from '@clio/core/v3';
import { artifactDisplayName } from './dashboard-presentation';
import { artifactDeliverables, latestResponseArtifacts } from './artifact-presentation';
import { isScientificDocument, paperLabels, withoutPaperMembers } from './scientific-document';

const file = (id: string, name: string): Artifact => ({
  id,
  session_id: 'session_1',
  workspace_id: 'workspace_1',
  name,
  media_type: 'application/x-tex',
  uri: `artifact://workspace_1/${name}@v1`,
  version: 1,
});

const paper = (members: unknown[], producer: Record<string, unknown> = {}): Artifact => ({
  ...file('artifact_paper', 'paper-bb'),
  media_type: 'application/pdf',
  producer: {
    designation: 'scientific-document',
    title: 'Burst Buffers and Checkpoint Performance',
    document_type: 'Paper',
    venue: 'IEEE conference',
    page_count: 4,
    members,
    ...producer,
  },
});

describe('scientific documents', () => {
  it('show a paper by its title, type, venue and pages', () => {
    const shown = paper([]);
    expect(isScientificDocument(shown)).toBe(true);
    expect(artifactDisplayName(shown)).toBe('Burst Buffers and Checkpoint Performance');
    expect(paperLabels(shown)).toEqual({ type: 'Paper', venue: 'IEEE conference', pages: '4 pages' });
    // Without a \title the paper is its project's name; without a template, a Paper.
    const bare = paper([], { title: '', document_type: '', venue: '', page_count: 1 });
    expect(artifactDisplayName(bare)).toBe('paper-bb');
    expect(paperLabels(bare)).toEqual({ type: 'Paper', venue: '', pages: '1 page' });
    expect(isScientificDocument(file('a', 'main.tex'))).toBe(false);
  });

  it('keep a paper’s sources inside it, in replies and in lists', () => {
    const intro = file('artifact_intro', 'paper-bb/sections/intro.tex');
    const main = file('artifact_main', 'paper-bb/main.tex');
    const notes = file('artifact_notes', 'notes.tex');
    // A reply's link carries member ids; the session listing carries member records.
    for (const members of [
      ['artifact_intro', 'artifact_main'],
      [{ artifact_id: 'artifact_intro' }, { artifact_id: 'artifact_main' }],
      // A later version of each: the files, named, are still inside the paper.
      [
        { artifact_id: 'artifact_intro_v2', name: 'paper-bb/sections/intro.tex' },
        { artifact_id: 'artifact_main_v2', name: 'paper-bb/main.tex' },
      ],
    ]) {
      const listed = [intro, main, notes, paper(members)];
      expect(withoutPaperMembers(listed).map((item) => item.id)).toEqual([
        'artifact_notes',
        'artifact_paper',
      ]);
      expect(latestResponseArtifacts(listed).map((item) => item.id)).toEqual([
        'artifact_notes',
        'artifact_paper',
      ]);
      expect(artifactDeliverables(listed).map((item) => item.id)).toEqual([
        'artifact_notes',
        'artifact_paper',
      ]);
    }
  });
});
