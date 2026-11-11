import type { BrowserCertificate } from '@clio/core/v3';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const repository = vi.hoisted(() => ({ trustBrowserCertificate: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
import { BrowserCertificateNotice } from './browser-certificate-notice';

const certificate: BrowserCertificate = {
  host: 'octopi.lan',
  url: 'https://octopi.lan/',
  error: 'ERR_CERT_AUTHORITY_INVALID',
  issuer: 'OctoPi',
  subject: 'octopi.lan',
  fingerprint: 'LyHcpzcUfoOk=',
  valid_to: '2027-01-01T00:00:00+00:00',
  grantable: true,
};

function show(value: BrowserCertificate) {
  return render(
    <TooltipProvider>
      <BrowserCertificateNotice sessionId="sess_1" pageId="p1" certificate={value} />
    </TooltipProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('names the site and its key, and trusts it for the conversation', async () => {
  const user = userEvent.setup();
  repository.trustBrowserCertificate.mockResolvedValue({
    host: 'octopi.lan',
    fingerprint: 'LyHcpzcUfoOk=',
    scope: 'session',
  });
  show(certificate);
  expect(screen.getByRole('status').textContent).toContain(
    'octopi.lan presented a certificate this browser does not trust',
  );
  const details = screen.getByRole('button', { name: /^Certificate details/ });
  expect(details.getAttribute('aria-label')).toContain('Issued by: OctoPi');
  expect(details.getAttribute('aria-label')).toContain('Key fingerprint (SHA-256): LyHcpzcUfoOk=');
  await user.click(screen.getByRole('button', { name: 'This conversation' }));
  expect(repository.trustBrowserCertificate).toHaveBeenCalledWith('sess_1', 'p1', 'session');
  await waitFor(() => expect(screen.getByText('Trusted. Restarting the browser…')).toBeTruthy());
});

it('says why a trust failed and offers it again', async () => {
  const user = userEvent.setup();
  repository.trustBrowserCertificate.mockRejectedValue(
    new Error('this page shows no certificate warning'),
  );
  show(certificate);
  await user.click(screen.getByRole('button', { name: 'This workspace' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'this page shows no certificate warning',
  );
  expect(screen.getByRole('button', { name: 'This workspace' })).toBeTruthy();
});

it("in the person's own Chrome, they proceed there", () => {
  show({ ...certificate, grantable: false });
  expect(screen.queryByRole('button', { name: 'This conversation' })).toBeNull();
  expect(screen.getByText(/proceed there if you trust it/)).toBeTruthy();
});
