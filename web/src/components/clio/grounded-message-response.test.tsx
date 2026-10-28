import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { artifactSchema, type WorkspaceResource } from '@clio/core/v3';
// These assertions exercise routed sources, after the real Markdown renderer loads.
import '@/components/ai-elements/markdown';
import { groundedMessageSegments } from '@/lib/grounded-message-sources';
import { GroundedMessageResponse } from './grounded-message-response';
import { PresentationNavigation } from './presentation-navigation';

afterEach(cleanup);

describe('GroundedMessageResponse', () => {
  it('renders a numbered mixed-source bibliography using routed Source objects', async () => {
    const openFile = vi.fn();
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenFile: openFile }}
      >
        <GroundedMessageResponse mode="static">
          {[
            'The records support this reading. [1](workspace-file:/data/protocol.md)',
            '',
            'Sources:',
            '1. [Protocol](workspace-file:/data/protocol.md)',
            '2. [External reference](https://example.com/protocol)',
          ].join('\n')}
        </GroundedMessageResponse>
      </PresentationNavigation.Provider>,
    );
    expect(await screen.findByRole('button', { name: /2 sources/u })).toBeVisible();
    const source = screen.getByRole('link', { name: '[1] Protocol' });
    expect(source).not.toHaveAttribute('target', '_blank');
    fireEvent.click(source);
    expect(openFile).toHaveBeenCalledWith('/data/protocol.md');
    expect(screen.getByRole('link', { name: /\[2\] External reference/u })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(groundedMessageSegments('Sources:\nThe source is unavailable.')).toEqual([
      { kind: 'markdown', text: 'Sources:\nThe source is unavailable.' },
    ]);
    const example = '```markdown\nSources:\n1. [Example](https://example.com)\n```';
    expect(groundedMessageSegments(example)).toEqual([{ kind: 'markdown', text: example }]);
  });

  it('keeps conversation and message references in the application router', async () => {
    function Location() {
      const location = useLocation();
      return <output>{location.pathname + location.hash}</output>;
    }
    render(
      <MemoryRouter initialEntries={['/workspaces/current/sessions/current']}>
        <GroundedMessageResponse mode="static">
          {'[Prior message](session://workspace/session#message-msg_1)'}
        </GroundedMessageResponse>
        <Location />
      </MemoryRouter>,
    );
    const link = await screen.findByRole('link', { name: 'Prior message' });
    expect(link).not.toHaveAttribute('target', '_blank');
    fireEvent.click(link);
    expect(screen.getByRole('status')).toHaveTextContent(
      '/workspaces/workspace/sessions/session#message-msg_1',
    );
  });

  it('keeps existing document anchors in the current document', async () => {
    render(
      <GroundedMessageResponse mode="static">
        {'[Section](#actual-section)'}
      </GroundedMessageResponse>,
    );
    const link = await screen.findByRole('link', { name: 'Section' });
    expect(link).toHaveAttribute('href', '#actual-section');
    expect(link).not.toHaveAttribute('target', '_blank');
  });
  it('opens a registered resource and refuses a mismatched workspace reference', async () => {
    const openResource = vi.fn();
    const resource: WorkspaceResource = {
      id: 'res_doc',
      workspace_id: 'w',
      client_upload_id: 'upload',
      revision: 1,
      name: 'protocol.md',
      claimed_mime: 'text/markdown',
      detected_mime: 'text/markdown',
      detection_source: 'fixture',
      declared_size: 100,
      received_size: 100,
      sha256: 'a'.repeat(64),
      state: 'ready',
      failure: '',
      created_at: '',
      updated_at: '',
      completed_at: '',
      mime_mismatch: false,
    };
    render(
      <PresentationNavigation.Provider
        value={{
          artifacts: {},
          resources: { [resource.id]: resource },
          subagents: {},
          onOpenResource: openResource,
        }}
      >
        <GroundedMessageResponse mode="static">
          {'[Uploaded protocol](resource://w/res_doc) [Other workspace](resource://other/res_doc)'}
        </GroundedMessageResponse>
      </PresentationNavigation.Provider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Sources 2' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Uploaded protocol' }));
    expect(openResource).toHaveBeenCalledTimes(1);
    expect(openResource).toHaveBeenCalledWith(resource);
    expect(screen.queryByRole('link', { name: 'Other workspace' })).not.toBeInTheDocument();
  });

  it('opens an inspected file citation through the conversation workbench', async () => {
    const openFile = vi.fn();
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenFile: openFile }}
      >
        <GroundedMessageResponse mode="static">
          {
            'The protocol describes projected area. [Protocol](workspace-file:/data/protocol%20notes.md)'
          }
        </GroundedMessageResponse>
      </PresentationNavigation.Provider>,
    );
    const link = await screen.findByRole('link', { name: 'Protocol' });
    expect(link).not.toHaveAttribute('target', '_blank');
    fireEvent.click(link);
    expect(openFile).toHaveBeenCalledTimes(1);
    expect(openFile).toHaveBeenCalledWith('/data/protocol notes.md');
  });

  it('opens only the actual registered artifact version and leaves missing sources unavailable', async () => {
    const openArtifact = vi.fn();
    const artifact = artifactSchema.parse({
      id: 'artifact_report',
      session_id: 's',
      workspace_id: 'w',
      name: 'analysis.md',
      uri: 'artifact://w/analysis.md@v2',
      version: 2,
      media_type: 'text/markdown',
      created_at: '2026-10-12T00:00:00Z',
    });
    render(
      <PresentationNavigation.Provider
        value={{
          artifacts: { [artifact.id]: artifact },
          subagents: {},
          onOpenArtifact: openArtifact,
        }}
      >
        <GroundedMessageResponse mode="static">
          {
            '[Recorded result](artifact://w/analysis.md@v2) [Missing result](artifact://artifact_missing) [Traversal](workspace-file:../private)'
          }
        </GroundedMessageResponse>
      </PresentationNavigation.Provider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Sources 3' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Recorded result' }));
    expect(openArtifact).toHaveBeenCalledTimes(1);
    expect(openArtifact).toHaveBeenCalledWith(artifact);
    expect(screen.queryByRole('link', { name: 'Missing result' })).not.toBeInTheDocument();
    expect(screen.getByText('Missing result').closest('[aria-disabled]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByRole('link', { name: 'Traversal' })).not.toBeInTheDocument();
  });

  it('projects consecutive standalone source entries as source objects', async () => {
    const text = [
      '**FACT** — SWMR limits structural changes.',
      '- Source: [Introduction to SWMR — HDF Group support site](https://support.hdfgroup.org/intro)',
      '- Source: [SWMR technical note](https://support.hdfgroup.org/note) — current reference',
      '',
      '**Conclusion:** the objects must exist first.',
    ].join('\n');

    expect(groundedMessageSegments(text)).toEqual([
      { kind: 'markdown', text: '**FACT** — SWMR limits structural changes.' },
      {
        kind: 'sources',
        sources: [
          {
            href: 'https://support.hdfgroup.org/intro',
            title: 'Introduction to SWMR — HDF Group support site',
          },
          {
            description: 'current reference',
            href: 'https://support.hdfgroup.org/note',
            title: 'SWMR technical note',
          },
        ],
      },
      { kind: 'markdown', text: '\n**Conclusion:** the objects must exist first.' },
    ]);

    render(<GroundedMessageResponse>{text}</GroundedMessageResponse>);

    expect(await screen.findByRole('button', { name: /2 sources/u })).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Introduction to SWMR — HDF Group support site/u }),
    ).toHaveAttribute('href', 'https://support.hdfgroup.org/intro');
    expect(screen.getByText('current reference')).toBeVisible();
    expect(screen.queryByText(/^Source:/u)).not.toBeInTheDocument();
    expect(screen.getByText(/the objects must exist first/u)).toBeVisible();
  });

  it('leaves ordinary Markdown links in the response body', () => {
    const text = 'Read the [HDF5 documentation](https://support.hdfgroup.org/) for details.';

    expect(groundedMessageSegments(text)).toEqual([{ kind: 'markdown', text }]);
  });
});
