/** `details.reason` of a failed turn whose provider refused the sign-in. */
export const PROVIDER_AUTH_REQUIRED_REASON = 'provider_auth_required';

/**
 * The provider a failed turn needs signed in again, when the service typed the
 * failure as a refused sign-in (`details.reason: provider_auth_required`).
 */
export function turnSignInProvider(
  errorInfo: Record<string, unknown> | undefined,
): { id: string; label: string } | undefined {
  const raw = errorInfo?.details;
  if (!raw || typeof raw !== 'object') return undefined;
  const details = raw as Record<string, unknown>;
  if (details.reason !== PROVIDER_AUTH_REQUIRED_REASON) return undefined;
  const id = typeof details.provider_id === 'string' ? details.provider_id : '';
  if (!id) return undefined;
  const label =
    typeof details.provider_label === 'string' && details.provider_label
      ? details.provider_label
      : id;
  return { id, label };
}
