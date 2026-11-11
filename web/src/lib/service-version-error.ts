import { vocab } from '@/lib/brand-vocabulary';

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
    super(
      !numbers.length
        ? `The service at this address is not a ${vocab.agent} this app can open.`
        : numbers.every((value) => value < wanted)
          ? `This ${vocab.agent} is older than this app. Update ${vocab.agent} to open it here.`
          : numbers.every((value) => value > wanted)
            ? `This ${vocab.agent} is newer than this app. Update this app to open it.`
            : `This ${vocab.agent} and this app are different releases. Update both to the same release.`,
    );
    this.name = 'ServiceVersionError';
    this.details = { required, offered };
  }
}
