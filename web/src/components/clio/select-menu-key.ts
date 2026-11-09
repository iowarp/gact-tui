import type { KeyboardEvent } from 'react';

/**
 * Selects the row whose letter matches the key. Attach to a menu content's
 * `onKeyDown`; submenus are portaled, so each content handles its own rows.
 */
export function selectMenuKey(event: KeyboardEvent<HTMLElement>): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.key.length !== 1) return;
  const menu = event.currentTarget;
  if (!(event.target instanceof Node) || !menu.contains(event.target)) return;
  const key = event.key.toLowerCase();
  const find = (scope: Element | null) =>
    Array.from(scope?.querySelectorAll<HTMLElement>('[data-menu-key]') ?? []).find(
      (row) => row.dataset.menuKey === key && !row.hasAttribute('data-disabled'),
    );
  // A submenu opened by pointer keeps focus on its trigger; its rows answer first.
  const trigger =
    event.target instanceof Element
      ? event.target.closest('[aria-haspopup="menu"][aria-expanded="true"]')
      : null;
  const submenuId = trigger?.getAttribute('aria-controls');
  const item = (submenuId ? find(document.getElementById(submenuId)) : undefined) ?? find(menu);
  if (!item) return;
  event.preventDefault();
  event.stopPropagation();
  item.click();
}
