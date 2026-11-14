import { useEffect, useRef } from 'react';

/**
 * The person chose not to share their profile email with scholarly sources. Kept in this
 * browser beside the profile itself, so reopening Settings does not tick it again.
 */
const OWN_ADDRESS_KEY = 'clio.search.contact-email-own.v1';

function readOwnAddress(): boolean {
  try {
    return localStorage.getItem(OWN_ADDRESS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeOwnAddress(own: boolean): void {
  try {
    if (own) localStorage.setItem(OWN_ADDRESS_KEY, '1');
    else localStorage.removeItem(OWN_ADDRESS_KEY);
  } catch {
    // Unavailable storage: the choice lasts while Settings stays open.
  }
}

/**
 * Share the profile email as the contact when the service holds no address and the person
 * has not chosen otherwise: once per visit, so the box only ever shows what the server holds.
 */
export function useProfileContactEmail({
  value,
  profileEmail,
  saving,
  error,
  onSave,
}: {
  value: string | undefined;
  profileEmail: string;
  saving: boolean;
  error?: string;
  onSave: (value: string) => void;
}): void {
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || value !== '' || !profileEmail || saving || error) return;
    synced.current = true;
    if (!readOwnAddress()) onSave(profileEmail);
  }, [profileEmail, value, saving, error, onSave]);
}
