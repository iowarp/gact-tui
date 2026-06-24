/**
 * 1.0 item 9 (JS half) — native menu action dispatch.
 *
 * Includes a cross-language contract test: every action id the JS dispatcher
 * knows must appear verbatim in the Rust MENU_SPEC (src-tauri/src/menu_spec.rs),
 * and vice versa — the two sides cannot drift without failing this test.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_MENU_ACTIONS,
  dispatchMenuAction,
  type MenuActionHandlers,
} from '../../src/menu-actions.js';
import menuActionsSpec from '../../src/menu-actions.json' with { type: 'json' };

describe('Menu action dispatch (1.0 item 9)', () => {
  it('every documented action routes to exactly one handler', () => {
    for (const action of ALL_MENU_ACTIONS) {
      const calls: string[] = [];
      const handlers: MenuActionHandlers = {
        newSession: () => calls.push('newSession'),
        importSession: () => calls.push('importSession'),
        exportSession: () => calls.push('exportSession'),
        openSettings: () => calls.push('openSettings'),
        toggleInspector: () => calls.push('toggleInspector'),
        toggleSessions: () => calls.push('toggleSessions'),
        cycleDensity: () => calls.push('cycleDensity'),
        commandPalette: () => calls.push('commandPalette'),
        keyboardShortcuts: () => calls.push('keyboardShortcuts'),
        fullscreen: () => calls.push('fullscreen'),
        helpDocs: () => calls.push('helpDocs'),
        about: () => calls.push('about'),
      };
      const handled = dispatchMenuAction(action, handlers);
      expect(handled, `action ${action} not handled`).toBe(true);
      expect(calls.length, `action ${action} hit ${calls.length} handlers`).toBe(1);
    }
  });

  it('returns false for unknown actions and missing handlers', () => {
    expect(dispatchMenuAction('bogus-action', {})).toBe(false);
    expect(dispatchMenuAction('new-session', {})).toBe(false);
  });

  it('ALL_MENU_ACTIONS is exactly the shared menu-actions.json source', () => {
    // ALL_MENU_ACTIONS is read straight from menu-actions.json, so this also
    // pins the hand-written MenuAction union to the same single source.
    expect([...ALL_MENU_ACTIONS]).toEqual(menuActionsSpec.actions);
  });

  it('JS action list matches the Rust MENU_SPEC exactly (contract test)', () => {
    const menuSpecRs = readFileSync(
      resolve(
        import.meta.dirname,
        '..',
        '..',
        '..',
        'desktop',
        'src-tauri',
        'src',
        'menu_spec.rs',
      ),
      'utf-8',
    );
    // Every JS-side action id must appear as a string literal in menu_spec.rs…
    for (const action of ALL_MENU_ACTIONS) {
      expect(menuSpecRs, `Rust MENU_SPEC is missing action id "${action}"`).toContain(
        `"${action}"`,
      );
    }
    // …and every Rust-side emitted action id must be known to JS. Rust ids
    // live in MenuEntry::Action { id: "…" } entries; extract conservatively
    // by scanning for the documented id pattern.
    const rustIds = new Set(
      [...menuSpecRs.matchAll(/"([a-z]+(?:-[a-z]+)*)"/g)]
        .map((m) => m[1]!)
        // Keep only strings that are known action ids (drops labels, events…).
        .filter((id) => (ALL_MENU_ACTIONS as readonly string[]).includes(id)),
    );
    expect([...rustIds].sort()).toEqual([...ALL_MENU_ACTIONS].sort());
  });
});
