import { vocab } from '@/lib/brand-vocabulary';
import { t } from '@lingui/core/macro';

function versionNumber(version: string): number {
  return Number.parseFloat(version.replace(/^v/iu, ''));
}

/**
 * The service and this build share no interface version. The line names the cause and
 * which side to update; the version numbers stay in the diagnostic details.
 */
export class ServiceVersionError extends Error {
  readonly details: { required: string; offered: readonly string[] };

  constructor(required: string, offered: readonly string[]) {
    const wanted = versionNumber(required);
    const numbers = offered.map(versionNumber).filter(Number.isFinite);
    const { agent } = vocab;
    super(
      !numbers.length
        ? t`The service at this address is not a ${agent} this app can open.`
        : numbers.every((value) => value < wanted)
          ? t`This ${agent} is older than this app. Update ${agent} to open it here.`
          : numbers.every((value) => value > wanted)
            ? t`This ${agent} is newer than this app. Update this app to open it.`
            : t`This ${agent} and this app are different releases. Update both to the same release.`,
    );
    this.name = 'ServiceVersionError';
    this.details = { required, offered };
  }
}
