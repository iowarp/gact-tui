/** Human-readable labels shared by memory lists and creation controls. */
export const MEMORY_CATEGORY_LABELS: Record<string, string> = {
  profile: 'Profile',
  preferences: 'Preferences',
  topics: 'Topics',
  areas: 'Areas of work',
  people: 'People',
  environments: 'Environments',
};

/** Memory results expose facts by default; users may collapse them explicitly. */
export const INLINE_MEMORY_TOOLS = new Set([
  'memory_read',
  'create_memory',
  'update_memory',
  'forget_memory',
  'propose_memory_change',
]);
