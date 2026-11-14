/**
 * The words of the agent-load card (clio-agent LZ-D2 to LZ-D6): "This agent uses Geo
 * and National Data Platform, which are not enabled. Enable them?" Each item says what
 * it is (a connector, or a plugin that bundles one) and what enabling does: downloads
 * its tools, turns it on, needs a value, asks for a sign-in. After Enable all, each
 * item's progress is said in words, never by a colour or a dot alone.
 */
import type { AgentNeedItem } from '@clio/core/v3';
import { plural, t } from '@lingui/core/macro';
import { listNeeds } from '@/lib/connector-presentation';
import { formatList } from '@/lib/locale-format';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';

/** The card's question, or its state once Enable all runs. */
export function agentNeedsTitle(
  agent: string,
  items: readonly AgentNeedItem[],
  phase: string,
): string {
  const names = formatList(
    items.map((item) => item.name),
    { and: true },
  );
  const failed = items.filter((item) => item.progress === 'failed').length;
  if (phase === 'working') return t`Enabling ${names}…`;
  if (phase === 'done')
    return failed
      ? plural(failed, { one: '# could not be enabled', other: '# could not be enabled' })
      : t`${names} enabled`;
  const off = items.some((item) => !item.enabled);
  return off
    ? plural(items.length, {
        one: `${agent} uses ${names}, which is not enabled. Enable it?`,
        other: `${agent} uses ${names}, which are not enabled. Enable them?`,
      })
    : plural(items.length, {
        one: `${agent} uses ${names}, which is not ready yet. Get it ready?`,
        other: `${agent} uses ${names}, which are not ready yet. Get them ready?`,
      });
}

/** What the item is: "Connector" or "Plugin" (PL-D1). */
export function agentNeedKind(item: AgentNeedItem): string {
  return item.kind === 'plugin' ? t`Plugin` : t`Connector`;
}

/** What enabling it does, in words: "downloads its tools, needs your address". */
export function agentNeedEffect(item: AgentNeedItem): string {
  const parts: string[] = [];
  if (item.download) parts.push(t`downloads its tools`);
  else if (item.download_unknown && !item.enabled) parts.push(t`may download its tools`);
  if (!item.enabled && !item.download) parts.push(t`turns it on`);
  const missing = listNeeds(item.missing.filter((need) => need.required));
  if (missing) parts.push(t`needs ${missing}`);
  if (item.asks_sign_in) parts.push(t`asks you to sign in when first used`);
  return parts.join(', ');
}

/** Where the item is after Enable all, in words. */
export function agentNeedProgress(item: AgentNeedItem): string {
  switch (item.progress) {
    case 'waiting':
      return t`Waiting`;
    case 'preparing':
      return t`Downloading its tools…`;
    case 'enabling':
      return t`Turning it on…`;
    case 'ready':
      return item.tool_count === null
        ? t`Ready`
        : plural(item.tool_count, { one: 'Ready, # tool', other: 'Ready, # tools' });
    case 'failed':
      return item.detail ? t`Not enabled: ${item.detail}` : t`Not enabled`;
    case 'skipped':
      return t`Not now`;
    default:
      return '';
  }
}

/** The mark beside a progress word (the word itself always says it). */
export function agentNeedTone(item: AgentNeedItem): StatusTone {
  if (item.progress === 'ready') return 'success';
  if (item.progress === 'failed') return 'error';
  if (item.progress === 'preparing' || item.progress === 'enabling') return 'running';
  if (item.progress === 'waiting') return 'waiting';
  return 'inactive';
}
