import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { attentionEvidenceHash, focusAttentionEvidence } from './attention-evidence-navigation';
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
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
