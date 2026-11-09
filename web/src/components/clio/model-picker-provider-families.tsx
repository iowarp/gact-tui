import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { ProviderLogoMark } from './provider-logo-mark';
import {
  providerGroupStatus,
  type PickerNodeData,
  type ProviderGroup,
  type ProviderHealth,
} from './model-picker-model';

export const ALCF_FAMILY_VALUE = 'provider-family:alcf';
export const ALCF_SERVERS = {
  argonne_sophia: 'Sophia',
  argonne_metis: 'Metis',
  argonne_minerva: 'Minerva',
  argonne_tara: 'Tara',
};

/** Only the four shared-login ALCF services belong to this picker family. */
export function isAlcfServer(providerId: string | undefined): boolean {
  return providerId !== undefined && Object.hasOwn(ALCF_SERVERS, providerId);
}

function familyHealth(groups: readonly ProviderGroup[]): ProviderHealth {
  if (groups.some((group) => group.health === 'checking')) return 'checking';
  if (groups.every((group) => group.health === 'healthy')) return 'healthy';
  if (groups.every((group) => group.health === 'setup')) return 'setup';
  if (groups.every((group) => group.health === 'unavailable')) return 'unavailable';
  return 'degraded';
}

/** Group browsing rows in place; each server retains its own model tree and identity. */
export function groupAlcfProviders(
  nodes: CascaderNode<PickerNodeData>[],
  expanded: boolean,
): CascaderNode<PickerNodeData>[] {
  const servers = nodes.filter(
    (node) => node.data?.kind === 'provider' && isAlcfServer(node.data.group.id),
  );
  if (!servers.length) return nodes;
  const groups = servers.flatMap((node) =>
    node.data?.kind === 'provider' ? [node.data.group] : [],
  );
  const group: ProviderGroup = {
    id: 'alcf',
    name: 'ALCF inference',
    choices: [],
    availableChoices: [],
    health: familyHealth(groups),
    setupNeed: groups.every((item) => item.setupNeed === groups[0].setupNeed)
      ? groups[0].setupNeed
      : undefined,
    detail: groups.map((item) => `${item.name}: ${providerGroupStatus(item).label}`).join('\n'),
  };
  const family: CascaderNode<PickerNodeData> = {
    value: ALCF_FAMILY_VALUE,
    label: group.name,
    hasChildren: true,
    count: servers.length,
    data: { kind: 'provider-family', group, serverIds: groups.map((item) => item.id), expanded },
  };
  const children = Object.entries(ALCF_SERVERS).flatMap(([id, label]) => {
    const server = servers.find(
      (node) => node.data?.kind === 'provider' && node.data.group.id === id,
    );
    return server
      ? [
          {
            ...server,
            label,
            // A server is indented under the family's name, without its own logo.
            icon: <ProviderLogoMark provider={null} />,
          },
        ]
      : [];
  });
  let inserted = false;
  return nodes.flatMap((node) => {
    if (node.data?.kind !== 'provider' || !isAlcfServer(node.data.group.id)) return [node];
    if (inserted) return [];
    inserted = true;
    return expanded ? [family, ...children] : [family];
  });
}
