import type { InfrastructureDependency } from '@clio/core/v3';

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
): string {
  const dependency = activeDependency(dependencies);
  if (dependency) {
    const target =
      dependency.category === 'mcp'
        ? `MCP ${dependency.title.replace(/\s+MCP$/u, '')}`
        : dependency.title;
    const action =
      dependency.state === 'retrying' || dependency.phase === 'retry'
        ? 'retrying'
        : dependency.phase === 'connect'
          ? 'connecting'
          : dependency.phase === 'provision'
            ? 'installing'
            : 'loading';
    return `Setting up environment (${action} ${target})`;
  }
  const preparedThisTurn = dependencies.some(
    (dependency) => dependency.state === 'ready' && dependency.observed_active,
  );
  return preparedThisTurn ? 'Starting agent' : 'Setting up session';
}
