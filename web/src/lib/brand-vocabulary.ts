import { brand } from '@brand';

/**
 * Product/agent/workspace nouns, extracted from the active brand instead of
 * hardcoded. `brand` is resolved at BUILD time (see `web/vite-plugin-brand.ts`),
 * so `vocab` is a plain module-level constant — every consumer imports it the
 * same way it would import `brand` itself, no hook or provider needed.
 *
 * - `vocab.product` — the installed native application (e.g. "CLIO Desktop").
 * - `vocab.agent` — what the running agent is called in first-person copy
 *   (e.g. "Keep {vocab.agent} running?"). Defaults to the brand's bare name.
 * - `vocab.workspace` — the noun for a project/session container (e.g.
 *   "workspace"). Lowercase; use `capitalize(vocab.workspace)` for a section
 *   title or column header.
 */
export const vocab = {
  product: brand.productName,
  agent: brand.agentName,
  workspace: brand.workspaceNoun,
} as const;

/**
 * The welcome composer's invitation. It names whom the person is about to ask: the
 * conversation's agent when one is chosen (the "with …" chip beside it), so the first
 * screen shows one name; the product brand otherwise.
 */
export function welcomePlaceholder(agentName?: string): string {
  return `Ask ${agentName?.trim() || brand.name} anything, or describe a task…`;
}

/** The noun with its indefinite article: `A CLIO`, `An Agent`. */
export function withArticle(noun: string): string {
  return `${/^[aeiou]/iu.test(noun) ? 'An' : 'A'} ${noun}`;
}

/** Upper-case the first letter — for a vocabulary noun used as a title/header. */
export function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

/**
 * The two wire protocols the desktop names explicitly instead of leaving
 * implicit: A2UI (the agent describes interactive surfaces the desktop
 * renders) and GACT (the interface the desktop uses to talk to the agent).
 * Every screen that names either protocol should read from here rather than
 * spelling the acronym inline, so the wording never drifts.
 */
export const PROTOCOL = {
  a2ui: 'A2UI protocol',
  gact: 'GACT protocol',
} as const;
