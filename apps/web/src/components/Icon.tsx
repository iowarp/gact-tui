import type { JSX } from 'solid-js';

/**
 * SVG icon set used throughout the desktop shell. Hand-curated Lucide-style
 * outlines (no emoji, no icon-font dep). All icons are 24×24 / stroke 1.5,
 * `currentColor` for stroke so they pick up the surrounding text color.
 */

export type IconName =
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
  | 'search'
  | 'plus'
  | 'send'
  | 'attach'
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
  | 'regenerate'
  | 'branch'
  | 'share'
  | 'menu'
  | 'palette'
  | 'mention'
  | 'user'
  | 'bot'
  | 'tool'
  | 'thinking'
  | 'diff'
  | 'arrow-up-right'
  | 'circle'
  | 'alert'
  | 'help';

const PATHS: Record<IconName, JSX.Element> = {
  home: <path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  sessions: (
    <>
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h12" />
    </>
  ),
  workspaces: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  agents: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </>
  ),
  tools: (
    <>
      <path d="M14.7 6.3a3 3 0 1 1 4.2 4.2L8 21.4l-4.2.4.4-4.2z" />
      <path d="M12 8l4 4" />
    </>
  ),
  mcp: (
    <>
      <path d="M4 7l8-4 8 4-8 4z" />
      <path d="M4 17l8 4 8-4" />
      <path d="M4 12l8 4 8-4" />
    </>
  ),
  memory: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10v4M11 10v4M15 10v4M19 10v4" />
    </>
  ),
  metrics: (
    <>
      <path d="M3 20h18" />
      <path d="M6 16v-6M10 16V8M14 16v-4M18 16V6" />
    </>
  ),
  doctor: (
    <>
      <path d="M12 2v20" />
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  send: <path d="M3 12l18-9-4 18-6-7-8-2z" />,
  attach: <path d="M21 11.5L12 20a5 5 0 0 1-7-7l9-9a4 4 0 0 1 6 6l-9 9a3 3 0 0 1-4-4l8-8" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  sparkle: (
    <>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 14l.8 2.3L22 17l-2.2.7L19 20l-.8-2.3L16 17l2.2-.7z" />
    </>
  ),
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  check: <path d="M5 12l5 5 9-11" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  'panel-right': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  'panel-left': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l11-11-4-4L4 16z" />
      <path d="M14 6l4 4" />
    </>
  ),
  regenerate: (
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M6 8v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" />
      <path d="M12 14v2" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8 11l8-4M8 13l8 4" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </>
  ),
  palette: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 7l3 3-3 3" />
      <path d="M13 14h5" />
    </>
  ),
  mention: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M15 12v1a2 2 0 0 0 4 0v-1a8 8 0 1 0-3.2 6.4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <circle cx="9" cy="13" r="1.2" />
      <circle cx="15" cy="13" r="1.2" />
      <path d="M12 3v4" />
      <circle cx="12" cy="3" r="1" />
    </>
  ),
  tool: (
    <>
      <path d="M14 5l5 5-9 9-5 1 1-5z" />
      <path d="M10 9l5 5" />
    </>
  ),
  thinking: (
    <>
      <circle cx="6" cy="14" r="1.5" />
      <circle cx="12" cy="14" r="1.5" />
      <circle cx="18" cy="14" r="1.5" />
      <path d="M6 9a6 6 0 0 1 12 0" />
    </>
  ),
  diff: (
    <>
      <path d="M12 4v16" />
      <path d="M4 8h6M4 16h6" />
      <path d="M14 8h6M14 12h6M14 16h6" />
    </>
  ),
  'arrow-up-right': (
    <>
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </>
  ),
  circle: <circle cx="12" cy="12" r="4" />,
  alert: (
    <>
      <path d="M12 3l10 17H2L12 3z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.9.4-1 1.2-1 2" />
      <circle cx="12" cy="17" r="0.5" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  size?: number;
  class?: string;
  /** Optional title for screen readers. */
  label?: string;
}

export function Icon(props: IconProps) {
  const size = () => props.size ?? 18;
  return (
    <svg
      class={'icon ' + (props.class ?? '')}
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={props.label ? undefined : 'true'}
      aria-label={props.label}
      role={props.label ? 'img' : undefined}
    >
      {PATHS[props.name]}
    </svg>
  );
}
