import type { ReactNode } from 'react';

/**
 * THE icon set — transcribed verbatim from the prototype's `menuIcon(name)`.
 *
 * Every glyph here is the prototype's own path data. Hand-drawing icons was a
 * mistake that produced, among other things, a "gear" that read as a sun; no
 * surface should ever author an inline <svg> again.
 *
 * `tool` is deliberately different: the prototype draws it on a 24x24 grid at
 * strokeWidth 2 (the standard web settings/gear glyph) and renders it at 12px.
 * Its geometry is preserved rather than normalised to the 12x12 grid.
 */

export type IconName =
  | 'check'
  | 'upload'
  | 'artifact'
  | 'folder'
  | 'csv'
  | 'doc'
  | 'term'
  | 'conf'
  | 'bin'
  | 'bot'
  | 'tool'
  | 'compact'
  | 'diff'
  | 'detach'
  | 'pulse'
  | 'bolt'
  | 'zap'
  | 'play'
  | 'sparkle'
  | 'swap'
  | 'ask'
  | 'pencil'
  | 'list'
  | 'chevrons'
  | 'warn'
  | 'house'
  | 'cloud'
  | 'key'
  // From the prototype's inline template SVGs (toolbar / composer / rail).
  | 'panel'
  | 'console'
  | 'artifacts'
  | 'ctx'
  | 'eye'
  | 'send'
  | 'arrow-up'
  | 'search'
  | 'pin'
  | 'plus'
  | 'dots';

export interface IconProps {
  name: IconName;
  size?: number;
}

const P = (d: string, w = 1.2) => (
  <path d={d} stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
);
const C = (cx: number, cy: number, r: number, filled = false) => (
  <circle
    cx={cx}
    cy={cy}
    r={r}
    stroke={filled ? 'none' : 'currentColor'}
    strokeWidth={1.1}
    {...(filled ? { fill: 'currentColor' } : {})}
  />
);

/** Path data, verbatim from the prototype's menuIcon(). */
const GLYPHS: Record<IconName, ReactNode> = {
  check: P('M2 6.5l2.6 2.6L10 3.4', 1.5),
  upload: (
    <>
      {P('M6 10V2')}
      {P('M2.8 5.2L6 2l3.2 3.2')}
    </>
  ),
  artifact: P('M6 1.5L10.5 6 6 10.5 1.5 6 6 1.5z'),
  folder: P(
    'M1.5 3.2c0-.7.5-1.2 1.2-1.2h2l1.2 1.4h3.9c.7 0 1.2.5 1.2 1.2v4.7c0 .7-.5 1.2-1.2 1.2H2.7c-.7 0-1.2-.5-1.2-1.2V3.2z',
  ),
  csv: (
    <>
      <rect x={1.5} y={1.5} width={9} height={9} rx={1.5} stroke="currentColor" strokeWidth={1.1} />
      {P('M1.5 4.5h9M5 4.5V10.5', 1.1)}
    </>
  ),
  doc: (
    <>
      {P('M2.5 1.5h4.5L9.5 4v6.5h-7V1.5z', 1.1)}
      {P('M4 6h4M4 8h4', 1.1)}
    </>
  ),
  term: (
    <>
      <rect x={1.5} y={2} width={9} height={8} rx={1.5} stroke="currentColor" strokeWidth={1.1} />
      {P('M3.5 5l1.5 1.5L3.5 8M6.5 8h2', 1.1)}
    </>
  ),
  conf: (
    <>
      {P('M2 3.8h8M2 8.2h8', 1.1)}
      <circle
        cx={4.2}
        cy={3.8}
        r={1.3}
        stroke="currentColor"
        strokeWidth={1.1}
        fill="var(--t-sf)"
      />
      <circle
        cx={7.8}
        cy={8.2}
        r={1.3}
        stroke="currentColor"
        strokeWidth={1.1}
        fill="var(--t-sf)"
      />
    </>
  ),
  bin: (
    <>
      {P('M6 1.2l4.2 2.4v4.8L6 10.8 1.8 8.4V3.6L6 1.2z', 1.1)}
      {P('M1.8 3.6L6 6l4.2-2.4M6 6v4.8', 1.1)}
    </>
  ),
  bot: (
    <>
      <rect
        x={2.2}
        y={4}
        width={7.6}
        height={5.6}
        rx={1.5}
        stroke="currentColor"
        strokeWidth={1.1}
      />
      {P('M6 4V1.8', 1.1)}
      {C(4.4, 6.8, 0.7, true)}
    </>
  ),
  // 24x24 / strokeWidth 2 — the standard settings glyph, kept at its own scale.
  tool: (
    <>
      <circle cx={12} cy={12} r={3} stroke="currentColor" strokeWidth={2} />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.36.4.66.73.87.3.2.66.3 1.02.3H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  compact: (
    <>
      {P('M6 1.5v3M6 10.5v-3')}
      {P('M4 3l2 1.5L8 3M4 9l2-1.5L8 9')}
    </>
  ),
  diff: (
    <>
      {P('M3.5 3.5h5M6 1v5')}
      {P('M3.5 9h5')}
    </>
  ),
  detach: (
    <>
      {P('M5 2.5H2.5v7h7V7')}
      {P('M6.8 2h3.2v3.2M10 2L5.8 6.2')}
    </>
  ),
  pulse: P('M1.5 6h2L5 3l2 6 1.5-3h2'),
  bolt: <path d="M6.9 1.1L2.6 7h2.7l-1.1 3.9L8.9 5H6.2l.7-3.9z" fill="currentColor" />,
  zap: <path d="M6.9 1.1L2.6 7h2.7l-1.1 3.9L8.9 5H6.2l.7-3.9z" fill="currentColor" stroke="none" />,
  play: (
    <path
      d="M3.5 2.2L9.5 6l-6 3.8V2.2z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  sparkle: (
    <path
      d="M6 1.3l1.1 3.1 3.1 1.1-3.1 1.1L6 9.7 4.9 6.6 1.8 5.5l3.1-1.1L6 1.3z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  swap: (
    <>
      {P('M3.5 1.8L1.5 3.8l2 2M1.5 3.8h7')}
      {P('M8.5 10.2l2-2-2-2M10.5 8.2h-7')}
    </>
  ),
  ask: (
    <>
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M4.7 4.8a1.4 1.4 0 112.2 1.4c-.5.4-.9.7-.9 1.2"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="9" r="0.5" fill="currentColor" />
    </>
  ),
  pencil: (
    <>
      {P('M2 10l.5-2.4L8.6 1.5l1.9 1.9L4.4 9.5 2 10z')}
      {P('M7.4 2.7l1.9 1.9', 1.1)}
    </>
  ),
  list: (
    <>
      {P('M4.5 3h6M4.5 6h6M4.5 9h6', 1.1)}
      {C(1.9, 3, 0.6, true)}
      {C(1.9, 6, 0.6, true)}
      {C(1.9, 9, 0.6, true)}
    </>
  ),
  chevrons: (
    <>
      {P('M2.8 2.5L6.3 6 2.8 9.5')}
      {P('M6.3 2.5L9.8 6 6.3 9.5')}
    </>
  ),
  warn: (
    <>
      {P('M6 1.8l4.8 8.4H1.2L6 1.8z')}
      {P('M6 5v2.4', 1.1)}
      {C(6, 8.8, 0.5, true)}
    </>
  ),
  house: (
    <>
      {P('M1.8 6L6 2l4.2 4')}
      {P('M3 5.2V10h6V5.2')}
    </>
  ),
  cloud: P('M3.4 9.5a2.4 2.4 0 01-.3-4.8A3.1 3.1 0 019.3 5.2 2.2 2.2 0 019 9.5H3.4z'),
  key: (
    <>
      {C(4, 4.4, 2.1)}
      {P('M5.6 6L10.3 10.7M8.3 8.7l1.5-1.4')}
    </>
  ),

  // ---- inline template glyphs, transcribed verbatim ----
  panel: (
    <>
      <rect x={1.5} y={1.5} width={9} height={9} rx={1.5} stroke="currentColor" strokeWidth={1.2} />
      {P('M4.5 1.5v9')}
    </>
  ),
  console: (
    <>
      <rect x={1.5} y={2} width={9} height={8} rx={1.4} stroke="currentColor" strokeWidth={1.2} />
      {P('M3.6 5.1l1.3 1.3-1.3 1.3M6.4 7.7h2')}
    </>
  ),
  artifacts: (
    <>
      <rect x={1.5} y={1.5} width={9} height={9} rx={1.5} stroke="currentColor" strokeWidth={1.2} />
      {P('M1.5 4.5h9')}
    </>
  ),
  ctx: P('M1.5 10.5V7M6 10.5V4M10.5 10.5V1.8', 1.4),
  eye: (
    <>
      <path
        d="M1.2 7S3.3 3.2 7 3.2 12.8 7 12.8 7 10.7 10.8 7 10.8 1.2 7 1.2 7z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="7" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  send: P('M6 9.9V2.1M3 5L6 2l3 3', 1.5),
  'arrow-up': (
    <path
      d="M7 11.5v-9M3 6.5l4-4 4 4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  search: (
    <g>
      <circle cx={5.2} cy={5.2} r={3.7} stroke="currentColor" strokeWidth={1.3} />
      <path d="M8 8L10.8 10.8" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
    </g>
  ),
  pin: (
    <path
      d="M6 1v4M3.5 5h5l-1 2.5h-3L3.5 5zM6 7.5V11"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  // The composer's attach control, transcribed from the prototype's
  // [title="Attach"] button: viewBox 0 0 12 12, stroke-width 1.4.
  plus: P('M6 1v10M1 6h10', 1.4),
  dots: (
    <>
      {C(2.2, 6, 1, true)}
      {C(6, 6, 1, true)}
      {C(9.8, 6, 1, true)}
    </>
  ),
};

export function Icon({ name, size = 12 }: IconProps) {
  const box =
    name === 'tool'
      ? '0 0 24 24'
      : name === 'arrow-up' || name === 'eye'
        ? '0 0 14 14'
        : '0 0 12 12';
  return (
    <svg
      width={size}
      height={size}
      viewBox={box}
      data-icon={name}
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {GLYPHS[name]}
    </svg>
  );
}
