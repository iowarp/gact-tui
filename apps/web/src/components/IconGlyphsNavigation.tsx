/**
 * UI component: Icon Glyphs Navigation.
 */
import type { IconGlyphFactory, IconName } from './IconTypes.js';

type NavigationIconName = Extract<
  IconName,
  | 'home'
  | 'sessions'
  | 'workspaces'
  | 'agents'
  | 'tools'
  | 'mcp'
  | 'memory'
  | 'metrics'
  | 'doctor'
  | 'settings'
>;

export const NAVIGATION_ICON_GLYPHS: Record<NavigationIconName, IconGlyphFactory> = {
  home: () => <path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  sessions: () => (
    <>
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h12" />
    </>
  ),
  workspaces: () => (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  agents: () => (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </>
  ),
  tools: () => (
    <>
      <path d="M14.7 6.3a3 3 0 1 1 4.2 4.2L8 21.4l-4.2.4.4-4.2z" />
      <path d="M12 8l4 4" />
    </>
  ),
  mcp: () => (
    <>
      <path d="M4 7l8-4 8 4-8 4z" />
      <path d="M4 17l8 4 8-4" />
      <path d="M4 12l8 4 8-4" />
    </>
  ),
  memory: () => (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10v4M11 10v4M15 10v4M19 10v4" />
    </>
  ),
  metrics: () => (
    <>
      <path d="M3 20h18" />
      <path d="M6 16v-6M10 16V8M14 16v-4M18 16V6" />
    </>
  ),
  doctor: () => (
    <>
      <path d="M12 2v20" />
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  settings: () => (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};
