import type { EvidenceLayout } from './evidence-layout';

/** Depict the two evidence regions above and below the dividing line. */
export function EvidenceLayoutIcon({ layout }: { layout: EvidenceLayout }) {
  const top = layout === 'top' || layout === 'both';
  const bottom = layout === 'bottom' || layout === 'both';
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect
        x="4"
        y="3"
        width="16"
        height="6"
        rx="1.5"
        fill={top ? 'currentColor' : 'none'}
        opacity={top ? 1 : 0.35}
      />
      <path d="M3 12h18" />
      <rect
        x="4"
        y="15"
        width="16"
        height="6"
        rx="1.5"
        fill={bottom ? 'currentColor' : 'none'}
        opacity={bottom ? 1 : 0.35}
      />
    </svg>
  );
}
