import { useCallback, useState } from 'react';

/** The row the pointer is over, which the detail strip follows ahead of the highlight. */
export function useHoveredRow() {
  const [hovered, setHovered] = useState<string>();
  const onHover = useCallback((key: string) => setHovered(key), []);
  const onLeave = useCallback(() => setHovered(undefined), []);
  return { hovered, onHover, onLeave };
}
