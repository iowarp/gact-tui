import type { Message, WorkspaceResource } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClioEvidenceView } from './observability-evidence';

afterEach(() => {
  cleanup();
});

function resourceMessage(input: {
  messageId: string;
  resourceId: string;
  revision: string;
  name: string;
  mediaType: string;
}): Message {
  return {
    id: input.messageId,
    session_id: 'sess_1',
    role: 'user',
    created_at: '2026-08-31T00:00:00Z',
    blocks: [
      {
        id: `${input.messageId}_block`,
        type: 'resource',
        resource_id: input.resourceId,
        resource_revision: input.revision,
        workspace_id: 'ws_1',
        name: input.name,
        media_type: input.mediaType,
      },
    ],
  };
}

function workspaceResource(overrides: Partial<WorkspaceResource> & { id: string }): WorkspaceResource {
  return {
    workspace_id: 'ws_1',
    client_upload_id: `${overrides.id}_upload`,
    revision: 1,
    name: overrides.id,
    claimed_mime: 'text/csv',
    detected_mime: 'text/csv',
    detection_source: 'signature',
    declared_size: 100,
    received_size: 100,
    sha256: '',
    state: 'ready',
    failure: '',
    created_at: '2026-08-30T00:00:00Z',
    updated_at: '2026-08-31T00:00:00Z',
    completed_at: '2026-08-31T00:00:00Z',
    mime_mismatch: false,
    ...overrides,
  };
}

describe('ClioEvidenceView resource sources', () => {
  it('shows the delivered revision as authoritative and labels a newer live revision distinctly', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[
          resourceMessage({
            messageId: 'message_1',
            resourceId: 'resource_pdf',
            revision: '1',
            name: 'paper.pdf',
            mediaType: 'application/pdf',
          }),
        ]}
        processes={[]}
        resources={[
          workspaceResource({
            id: 'resource_pdf',
            revision: 2,
            name: 'paper.pdf',
            claimed_mime: 'application/pdf',
            detected_mime: 'application/pdf',
            sha256: 'abcdef0123456789abcdef0123456789',
            received_size: 4096,
          }),
        ]}
      />,
    );

    // The revision DELIVERED to the model (from the message block) is authoritative history —
    // it must not be silently replaced by the live resource's newer revision.
    expect(screen.getByText('Revision 1')).toBeVisible();
    expect(screen.getByText(/Current revision 2/u)).toBeVisible();
  });

  it('does not silently substitute the live revision when the block and resource agree', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[
          resourceMessage({
            messageId: 'message_1',
            resourceId: 'resource_pdf',
            revision: '1',
            name: 'paper.pdf',
            mediaType: 'application/pdf',
          }),
        ]}
        processes={[]}
        resources={[workspaceResource({ id: 'resource_pdf', revision: 1, name: 'paper.pdf' })]}
      />,
    );

    expect(screen.getByText('Revision 1')).toBeVisible();
    expect(screen.queryByText(/Current revision/u)).not.toBeInTheDocument();
  });

  it('renders resource detail as sibling elements, never a middot-joined string', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[
          resourceMessage({
            messageId: 'message_1',
            resourceId: 'resource_pdf',
            revision: '1',
            name: 'paper.pdf',
            mediaType: 'application/pdf',
          }),
        ]}
        processes={[]}
        resources={[
          workspaceResource({
            id: 'resource_pdf',
            revision: 1,
            name: 'paper.pdf',
            claimed_mime: 'application/pdf',
            detected_mime: 'application/pdf',
            sha256: 'abcdef0123456789abcdef0123456789',
            received_size: 4096,
          }),
        ]}
      />,
    );

    expect(screen.getByText('Revision 1')).toBeVisible();
    expect(screen.getByText('application/pdf')).toBeVisible();
    expect(screen.getByText('4.1 KB')).toBeVisible();
    expect(screen.getByText(/SHA-256 abcdef012345/u)).toBeVisible();
    expect(screen.queryByText(/·/u)).not.toBeInTheDocument();
  });

  it('dedups resource sources by (resource id, revision), not by the rendered detail string', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[
          resourceMessage({
            messageId: 'message_alpha',
            resourceId: 'resource_alpha',
            revision: '1',
            name: 'alpha.csv',
            mediaType: 'text/csv',
          }),
          resourceMessage({
            messageId: 'message_beta',
            resourceId: 'resource_beta',
            revision: '1',
            name: 'beta.csv',
            mediaType: 'text/csv',
          }),
        ]}
        processes={[]}
        resources={[
          workspaceResource({ id: 'resource_alpha', revision: 1, name: 'alpha.csv' }),
          workspaceResource({ id: 'resource_beta', revision: 1, name: 'beta.csv' }),
        ]}
      />,
    );

    // Two distinct resources whose rendered detail (type/revision/size, no sha on either)
    // is identical text must still both appear — dedup must key on resource identity, not
    // on the formatted string, or one of these two distinct sources would be dropped.
    expect(screen.getByText('alpha.csv')).toBeVisible();
    expect(screen.getByText('beta.csv')).toBeVisible();
  });

  it('still collapses the same resource and revision referenced from two message blocks', () => {
    render(
      <ClioEvidenceView
        artifacts={[]}
        contextFiles={[]}
        diffs={[]}
        messages={[
          resourceMessage({
            messageId: 'message_1',
            resourceId: 'resource_pdf',
            revision: '1',
            name: 'paper.pdf',
            mediaType: 'application/pdf',
          }),
          resourceMessage({
            messageId: 'message_2',
            resourceId: 'resource_pdf',
            revision: '1',
            name: 'paper.pdf',
            mediaType: 'application/pdf',
          }),
        ]}
        processes={[]}
        resources={[workspaceResource({ id: 'resource_pdf', revision: 1, name: 'paper.pdf' })]}
      />,
    );

    expect(screen.getAllByText('paper.pdf')).toHaveLength(1);
  });
});
