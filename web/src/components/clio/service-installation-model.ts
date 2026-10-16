import type { ManagedServiceDefinition } from '@clio/core/v3';

export type InstallationMethod = 'native' | 'container' | 'other';

/** Classify the driver's requirements, including native apps with container dependencies. */
export function installationMethod(
  variant: ManagedServiceDefinition['variants'][number],
): InstallationMethod {
  if (['container', 'supervised_stack'].includes(variant.install_type)) return 'container';
  if (['native_uv', 'native_archive', 'uv_tool', 'bootstrap'].includes(variant.install_type))
    return 'native';
  return 'other';
}
