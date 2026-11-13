import type { InfrastructureDependency } from '@clio/core/v3';
import { t } from '@lingui/core/macro';

function activeDependency(
  dependencies: readonly InfrastructureDependency[],
): InfrastructureDependency | undefined {
  return dependencies.find(
    (dependency) => dependency.state === 'running' || dependency.state === 'retrying',
  );
}

/** Derive the one honest, evolving startup sentence shown in the composer. */
export function infrastructurePreparationLabel(
  dependencies: readonly InfrastructureDependency[],
  followUp = false,
): string {
  const dependency = activeDependency(dependencies);
  if (dependency) {
    // i18n-ignore: a protocol name and a service name
    const mcpName = `MCP ${dependency.title.replace(/\s+MCP$/u, '')}`;
    const target = dependency.category === 'mcp' ? mcpName : dependency.title;
    if (dependency.state === 'retrying' || dependency.phase === 'retry')
      return t`Setting up environment (retrying ${target})`;
    if (dependency.phase === 'connect') return t`Setting up environment (connecting ${target})`;
    if (dependency.phase === 'provision') return t`Setting up environment (installing ${target})`;
    return t`Setting up environment (loading ${target})`;
  }
  const preparedThisTurn = dependencies.some(
    (dependency) => dependency.state === 'ready' && dependency.observed_active,
  );
  return preparedThisTurn
    ? t`Starting agent`
    : followUp
      ? t`Preparing next response`
      : t`Setting up session`;
}
