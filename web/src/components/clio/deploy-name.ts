/** A service already in the connect list, for the name's uniqueness check. */
export type KnownServiceName = {
  endpoint: string;
  label?: string;
  location?: string;
  source?: string;
};

/** The default name for the desktop's own service. */
export const LOCAL_NAME = 'This computer';

/**
 * Why `name` cannot name the service being deployed, or undefined when it
 * can. The entry this deploy replaces (the local service itself, or an
 * earlier deploy to the same host) does not count as a clash.
 */
export function deployNameError(
  name: string,
  known: readonly KnownServiceName[],
  replaces: (service: KnownServiceName) => boolean,
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return 'Give this service a name.';
  const clash = known.some(
    (service) =>
      !replaces(service) &&
      service.label?.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
  );
  return clash ? `A service named “${trimmed}” already exists.` : undefined;
}
