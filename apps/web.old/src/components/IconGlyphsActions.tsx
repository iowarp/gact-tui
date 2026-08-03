/**
 * UI component: Icon Glyphs Actions.
 */
import type { IconGlyphFactory, IconName } from './IconTypes.js';

type ActionIconName = Extract<
  IconName,
  | 'search'
  | 'plus'
  | 'send'
  | 'attach'
  | 'image'
  | 'audio'
  | 'mic'
  | 'stop'
  | 'sparkle'
  | 'chevron-down'
  | 'chevron-right'
  | 'check'
  | 'close'
  | 'panel-right'
  | 'panel-left'
  | 'copy'
  | 'edit'
  | 'refresh'
  | 'regenerate'
  | 'branch'
  | 'share'
  | 'menu'
  | 'palette'
  | 'mention'
>;

export const ACTION_ICON_GLYPHS: Record<ActionIconName, IconGlyphFactory> = {
  search: () => (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  plus: () => (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  send: () => <path d="M3 12l18-9-4 18-6-7-8-2z" />,
  attach: () => (
    <path d="M21 11.5L12 20a5 5 0 0 1-7-7l9-9a4 4 0 0 1 6 6l-9 9a3 3 0 0 1-4-4l8-8" />
  ),
  image: () => (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5-5-5 5-2-2-5 5" />
    </>
  ),
  audio: () => (
    <>
      <path d="M6 2h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M14 2v4h4" />
      <path d="M9 16v-4l4-2v6" />
      <circle cx="8.5" cy="16.5" r="1.5" />
      <circle cx="12.5" cy="16.5" r="1.5" />
    </>
  ),
  mic: () => (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </>
  ),
  stop: () => <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  sparkle: () => (
    <>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 14l.8 2.3L22 17l-2.2.7L19 20l-.8-2.3L16 17l2.2-.7z" />
    </>
  ),
  'chevron-down': () => <path d="M6 9l6 6 6-6" />,
  'chevron-right': () => <path d="M9 6l6 6-6 6" />,
  check: () => <path d="M5 12l5 5 9-11" />,
  close: () => <path d="M6 6l12 12M18 6L6 18" />,
  'panel-right': () => (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  'panel-left': () => (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  copy: () => (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  edit: () => (
    <>
      <path d="M4 20h4l11-11-4-4L4 16z" />
      <path d="M14 6l4 4" />
    </>
  ),
  refresh: () => (
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  regenerate: () => (
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  branch: () => (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M6 8v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" />
      <path d="M12 14v2" />
    </>
  ),
  share: () => (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8 11l8-4M8 13l8 4" />
    </>
  ),
  menu: () => (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </>
  ),
  palette: () => (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 7l3 3-3 3" />
      <path d="M13 14h5" />
    </>
  ),
  mention: () => (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M15 12v1a2 2 0 0 0 4 0v-1a8 8 0 1 0-3.2 6.4" />
    </>
  ),
};
