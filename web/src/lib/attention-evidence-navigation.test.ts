import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  attentionEvidenceHash,
  focusAttentionEvidence,
  readAttentionEvidence,
} from './attention-evidence-navigation';
import { attentionProfileSchema } from '@clio/core/v3';
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

it('restores exact profile and capture identity only for the owning session', () => {
  const inspection = {
    schema_version: 1 as const,
    direction: 'generated_to_source' as const,
    selections: [
      {
        session_id: 's',
        message_id: 'm',
        part_id: 'p',
        content_revision: 'rev',
        field: 'text' as const,
        selection: { kind: 'whole' as const },
      },
    ],
    profile: attentionProfileSchema.parse({ name: 'custom', decay_base: 0.7 }),
    profile_revision: 'profile-rev',
    lm_call_id: 'call-1',
    capture_sha256: 'sha-1',
  };
  const hash = attentionEvidenceHash(
    inspection.selections[0]!,
    inspection.profile_revision,
    inspection,
  );
  expect(readAttentionEvidence(hash, 's')).toMatchObject(inspection);
  expect(readAttentionEvidence(hash, 'another-session')).toBeUndefined();
  expect(readAttentionEvidence('#message-m?inspection=not-json', 's')).toBeUndefined();
  expect(readAttentionEvidence('#message-m?inspection=' + 'x'.repeat(65537), 's')).toBeUndefined();
});

it('carries the exact field revision and refuses a changed rendering', () => {
  const hash = attentionEvidenceHash(
    { message_id: 'm', part_id: 'p', field: 'text', content_revision: 'old' },
    'profile-rev',
  );
  expect(hash).toContain('profile=profile-rev');
  document.body.innerHTML =
    '<div data-message-id="m"><p data-part-id="p" data-field="text" data-content-revision="new">changed</p></div>';
  const query = new URLSearchParams(hash.split('?')[1]);
  expect(focusAttentionEvidence('m', query)).toBe(false);
  expect(toast.error).toHaveBeenCalledWith('This field is not displaying the referenced revision.');
});
