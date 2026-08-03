/**
 * UI component: Icon Glyphs Objects.
 */
import type { IconGlyphFactory, IconName } from './IconTypes.js';

type ObjectIconName = Extract<
  IconName,
  | 'user'
  | 'bot'
  | 'tool'
  | 'thinking'
  | 'diff'
  | 'arrow-up-right'
  | 'circle'
  | 'alert'
  | 'pin'
  | 'bell'
  | 'help'
  | 'file'
  | 'folder'
  | 'catalog'
  | 'book'
  | 'shield'
  | 'plug'
>;

export const OBJECT_ICON_GLYPHS: Record<ObjectIconName, IconGlyphFactory> = {
  user: () => (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  bot: () => (
    <>
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <circle cx="9" cy="13" r="1.2" />
      <circle cx="15" cy="13" r="1.2" />
      <path d="M12 3v4" />
      <circle cx="12" cy="3" r="1" />
    </>
  ),
  tool: () => (
    <>
      <path d="M14 5l5 5-9 9-5 1 1-5z" />
      <path d="M10 9l5 5" />
    </>
  ),
  thinking: () => (
    <>
      <circle cx="6" cy="14" r="1.5" />
      <circle cx="12" cy="14" r="1.5" />
      <circle cx="18" cy="14" r="1.5" />
      <path d="M6 9a6 6 0 0 1 12 0" />
    </>
  ),
  diff: () => (
    <>
      <path d="M12 4v16" />
      <path d="M4 8h6M4 16h6" />
      <path d="M14 8h6M14 12h6M14 16h6" />
    </>
  ),
  'arrow-up-right': () => (
    <>
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </>
  ),
  circle: () => <circle cx="12" cy="12" r="4" />,
  alert: () => (
    <>
      <path d="M12 3l10 17H2L12 3z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </>
  ),
  pin: () => (
    <>
      <path d="M12 2v8" />
      <path d="M7 10h10l-2 5h-6l-2-5z" />
      <path d="M12 15v7" />
    </>
  ),
  bell: () => (
    <>
      <path d="M6 8a6 6 0 1 1 12 0c0 4 2 5 2 6H4c0-1 2-2 2-6z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </>
  ),
  help: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.9.4-1 1.2-1 2" />
      <circle cx="12" cy="17" r="0.5" />
    </>
  ),
  file: () => (
    <>
      <path d="M6 2h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M14 2v4h4" />
    </>
  ),
  folder: () => (
    <>
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </>
  ),
  catalog: () => (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 17.5h7" />
      <path d="M14 14.5h7" />
      <path d="M14 20.5h4" />
    </>
  ),
  book: () => (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
    </>
  ),
  shield: () => (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />
    </>
  ),
  plug: () => (
    <>
      <path d="M9 2v6M15 2v6" />
      <path d="M7 8h10v3a5 5 0 0 1-10 0z" />
      <path d="M12 16v6" />
    </>
  ),
};
