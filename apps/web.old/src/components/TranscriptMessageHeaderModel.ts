/**
 * Pure helpers for the message header: role icon/label mapping and absolute
 * timestamp formatting.
 */
import { brand } from '@brand';
import { formatTimestamp } from '../formatters.js';
import type { IconName } from './Icon.js';

const ROLE_ICON: Record<string, IconName> = {
  user: 'user',
  assistant: 'bot',
  system: 'help',
  tool: 'tool',
};

const ROLE_LABEL: Record<string, string> = {
  user: 'You',
  assistant: brand.name,
  system: 'System',
  tool: 'Tool',
};

export function transcriptRoleIcon(role: string): IconName {
  return ROLE_ICON[role] ?? 'circle';
}

export function transcriptRoleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

export function absoluteMessageTime(iso: string): string {
  return formatTimestamp(iso);
}

export function relativeMessageTime(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const delta = now - d.getTime();
  const min = Math.round(delta / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}
