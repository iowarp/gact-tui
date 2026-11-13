import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { writeOwnAddress } from './search-contact-email-sync';
import { SearchTextSetting } from './search-text-setting';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

const TITLE = t`Contact email for Crossref and OpenAlex (optional)`;

/**
 * The address Crossref and OpenAlex see as the contact for these searches. With a profile
 * email, one box shares it; clearing the box shares none and offers a field for another.
 * Without one, the field stands alone with a way to add an email to the profile.
 */
export function SearchContactEmail({
  value,
  profileEmail,
  saving,
  error,
  onSave,
}: {
  /** The address the server holds now. */
  value: string;
  /** The email in the person's profile, or empty. */
  profileEmail: string;
  saving: boolean;
  error?: string;
  onSave: (value: string) => void;
}) {
  const field = (
    <SearchTextSetting
      error={error}
      id="web-search-contact-email"
      inputMode="email"
      onSave={onSave}
      // i18n-ignore: an example address, not copy
      placeholder="you@example.org"
      saving={saving}
      title={profileEmail ? t`Another contact email (optional)` : TITLE}
      value={profileEmail && value === profileEmail ? '' : value}
    />
  );
  if (!profileEmail)
    return (
      <>
        {field}
        <p className="mt-1 text-xs text-muted-foreground">
          <Trans>
            <Link className="text-link underline-offset-4 hover:underline" to="/settings/profile">
              Add an email in Profile
            </Link>{' '}
            to use it here.
          </Trans>
        </p>
      </>
    );
  const shared = value === profileEmail;
  return (
    <>
      <div className="flex min-h-11 items-center gap-2.5 border-b border-border/70 py-1.5">
        <Checkbox
          checked={shared}
          disabled={saving}
          id="web-search-profile-email"
          onCheckedChange={(checked) => {
            const use = checked === true;
            writeOwnAddress(!use);
            onSave(use ? profileEmail : '');
          }}
        />
        <Label
          className="min-w-0 text-[0.8125rem] leading-normal font-normal [overflow-wrap:anywhere]"
          htmlFor="web-search-profile-email"
        >
          {t`Use my profile email (${profileEmail})`}
        </Label>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t`Crossref and OpenAlex answer faster when a search names a contact.`}
      </p>
      {shared ? (
        error ? (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null
      ) : (
        field
      )}
    </>
  );
}
