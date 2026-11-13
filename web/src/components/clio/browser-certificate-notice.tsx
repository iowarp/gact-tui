import type { BrowserCertificate } from '@clio/core/v3';
import { ShieldAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRepository } from '@/hooks/use-repository';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { t, ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { formatLocale } from '@/lib/locale-format';

/** The certificate's facts, for the hover card and the screen reader. */
function certificateFacts(certificate: BrowserCertificate): string[] {
  return [
    t`Site: ${ph({ host: certificate.host })}`,
    certificate.subject ? t`Issued to: ${ph({ subject: certificate.subject })}` : '',
    certificate.issuer ? t`Issued by: ${ph({ issuer: certificate.issuer })}` : '',
    certificate.valid_to
      ? t`Valid until: ${ph({ date: new Date(certificate.valid_to).toLocaleDateString(formatLocale()) })}`
      : '',
    certificate.fingerprint
      ? t`Key fingerprint (SHA-256): ${ph({ fingerprint: certificate.fingerprint })}`
      : '',
    certificate.error ? t`Browser error: ${ph({ error: certificate.error })}` : '',
  ].filter(Boolean);
}

/**
 * Beside Chromium's own certificate warning: the person, and only the person, can trust a
 * certificate the browser does not, for this conversation or this workspace. The trust is
 * pinned to the certificate's key, so a device that presents another one is asked about
 * again. In the person's own Chrome they proceed there instead.
 */
export function BrowserCertificateNotice({
  sessionId,
  pageId,
  certificate,
}: {
  sessionId: string;
  pageId: string;
  certificate: BrowserCertificate;
}) {
  const repository = useRepository();
  const [trusting, setTrusting] = useState<'session' | 'workspace' | null>(null);
  const [failed, setFailed] = useState('');
  const facts = certificateFacts(certificate);
  const host = certificate.host;

  const trust = async (scope: 'session' | 'workspace') => {
    setTrusting(scope);
    setFailed('');
    try {
      await repository.trustBrowserCertificate(sessionId, pageId, scope);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : t`The certificate could not be trusted.`);
      setTrusting(null);
    }
  };

  return (
    <div
      role="status"
      data-slot="browser-certificate-notice"
      className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-sm"
    >
      <ShieldAlertIcon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <Trans>
          <strong className="font-medium">{host}</strong> presented a certificate this browser does
          not trust. Trust it only if you know this device.
        </Trans>
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t`Certificate details: ${ph({ facts: facts.join('. ') })}`}
          >
            <InfoIcon aria-hidden className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <ul className="grid gap-0.5 break-all">
            {facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
      {certificate.grantable ? (
        trusting ? (
          <span className="text-xs text-muted-foreground">{t`Trusted. Restarting the browser…`}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t`Trust this certificate for`}</span>
            <Button size="sm" variant="outline" onClick={() => void trust('session')}>
              {t`This conversation`}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void trust('workspace')}>
              {t`This workspace`}
            </Button>
          </span>
        )
      ) : (
        <span className="text-xs text-muted-foreground">
          {t`This page is in your own browser: proceed there if you trust it.`}
        </span>
      )}
      {failed ? (
        <p role="alert" className="basis-full text-xs text-destructive">
          {failed}
        </p>
      ) : null}
    </div>
  );
}
