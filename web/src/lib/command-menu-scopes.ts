import { t } from '@lingui/core/macro';
/** The result types of the Ctrl K palette, in tab order. */
export type CommandMenuScope =
  | 'all'
  | 'conversations'
  | 'files'
  | 'artifacts'
  | 'actions'
  | 'settings'
  | 'more';

export const COMMAND_MENU_SCOPES: readonly { value: CommandMenuScope; label: string }[] = [
  { value: 'all', label: t`All` },
  { value: 'conversations', label: t`Conversations` },
  { value: 'files', label: t`Files` },
  { value: 'artifacts', label: t`Artifacts` },
  { value: 'actions', label: t`Actions` },
  { value: 'settings', label: t`Settings` },
  { value: 'more', label: t`More` },
];

/** A first character that opens one type: `> dark`, `#survey`, `@sites`. */
const PREFIX_SCOPES: Readonly<Record<string, CommandMenuScope>> = {
  '>': 'actions',
  '#': 'conversations',
  '@': 'files',
};

/**
 * Rows each group shows under All. Unit: rows per group. The rest stay one
 * Enter away in the group's own tab, behind a "N more" row.
 */
export const ALL_SCOPE_GROUP_LIMIT = 5;

export interface CommandMenuQuery {
  /** What the person is searching for, without a type prefix. */
  text: string;
  /** The type a leading `>`, `#` or `@` picked, if any. */
  prefixScope?: CommandMenuScope;
}

export function parseCommandMenuQuery(raw: string): CommandMenuQuery {
  const prefixScope = PREFIX_SCOPES[raw.charAt(0)];
  return prefixScope ? { text: raw.slice(1), prefixScope } : { text: raw };
}

/** The query with any type prefix removed, for when a tab is picked by hand. */
export function withoutCommandMenuPrefix(raw: string): string {
  return parseCommandMenuQuery(raw).prefixScope ? raw.slice(1).trimStart() : raw;
}

/** The neighbouring tab, for ← and → at the edges of the search text. */
export function adjacentCommandMenuScope(
  scope: CommandMenuScope,
  direction: 1 | -1,
): CommandMenuScope | undefined {
  const index = COMMAND_MENU_SCOPES.findIndex((item) => item.value === scope);
  return COMMAND_MENU_SCOPES[index + direction]?.value;
}

/** Whether a group of `scope` is shown while `active` is the selected tab. */
export function inCommandMenuScope(active: CommandMenuScope, scope: CommandMenuScope): boolean {
  return active === 'all' || active === scope;
}

/** At most `limit` rows, and how many were left out. */
export function capRows<Item>(
  items: readonly Item[],
  limit: number | undefined,
): { rows: readonly Item[]; hidden: number } {
  return limit === undefined || items.length <= limit
    ? { rows: items, hidden: 0 }
    : { rows: items.slice(0, limit), hidden: items.length - limit };
}
