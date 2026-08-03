/**
 * Kit conformance guard (gact-tui#331).
 *
 * The owner's requirement is "never again one class per window": every overlay,
 * dialog and tab strip must be COMPOSED from the kit, not hand-rolled. Convention
 * cannot enforce that — this guard does.
 *
 * It walks the app source and fails on any module outside `src/kit/` that
 * hand-rolls a kit primitive. The planted-violation test proves the guard
 * actually bites rather than passing vacuously.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '..', '..', 'src');
const KIT = resolve(SRC, 'kit');

/** Patterns that mean "a kit primitive was rebuilt by hand". */
export const BESPOKE_PATTERNS: Array<{ id: string; pattern: RegExp; use: string }> = [
  {
    id: 'dialog-role',
    pattern: /role=["']dialog["']/,
    use: 'compose <Modal> from src/kit instead of a bare role="dialog"',
  },
  {
    id: 'tablist-role',
    pattern: /role=["']tablist["']/,
    use: 'compose <Tabs> from src/kit instead of a bare role="tablist"',
  },
  {
    id: 'menu-role',
    pattern: /role=["']menu["']/,
    use: 'compose <ContextMenu> from src/kit instead of a bare role="menu"',
  },
  {
    id: 'scrim',
    pattern: /var\(--t-scrim\)/,
    use: 'the scrim belongs to <Modal>/<Popover>; do not paint one directly',
  },
  {
    id: 'inline-svg',
    pattern: /<svg[\s>]/,
    use: 'use <Icon name="..."/> from src/kit — hand-drawn glyphs produced a gear that read as a sun',
  },
  {
    id: 'modal-width',
    pattern: /width:\s*680px/,
    use: 'the 680px dialog scaffold is <Modal>; do not restate its width',
  },
];

export function walkSource(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      // `tauri/` is a verbatim port pinned elsewhere; it renders nothing.
      if (entry.name === 'tauri') continue;
      out.push(...walkSource(full));
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Scan a source tree, returning `${file}:${violationId}` for each hit. */
export function findBespokeViolations(root: string, skipKit = true): string[] {
  const violations: string[] = [];
  for (const file of walkSource(root)) {
    if (skipKit && file.startsWith(KIT)) continue;
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
    const source = readFileSync(file, 'utf8');
    for (const { id, pattern } of BESPOKE_PATTERNS) {
      if (pattern.test(source)) violations.push(`${file}:${id}`);
    }
  }
  return violations;
}

describe('kit conformance guard', () => {
  it('no surface outside the kit hand-rolls a kit primitive', () => {
    expect(findBespokeViolations(SRC)).toEqual([]);
  });

  it.each(BESPOKE_PATTERNS)('flags a planted bespoke $id', ({ pattern, id }) => {
    // The guard must bite. Feed it a planted violation and require a hit —
    // otherwise a broken regex would let the suite pass while enforcing nothing.
    const planted = {
      'dialog-role': '<div role="dialog" />',
      'tablist-role': '<div role="tablist" />',
      'menu-role': '<div role="menu" />',
      scrim: '.x { background: var(--t-scrim); }',
      'inline-svg': '<svg viewBox="0 0 12 12" />',
      'modal-width': '.x { width: 680px; }',
    }[id] as string;

    expect(planted).toBeDefined();
    expect(pattern.test(planted)).toBe(true);
  });

  it('the kit itself is exempt — it is where the primitives live', () => {
    // Sanity: the kit DOES contain the vocabulary the guard bans elsewhere.
    // If this ever empties, the guard above is passing for the wrong reason.
    const kitHits = findBespokeViolations(KIT, false);
    expect(kitHits.length).toBeGreaterThan(0);
  });
});
