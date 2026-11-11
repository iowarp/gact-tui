import type { KeyboardEvent } from 'react';

/** Enter and Space open a row, like a click. */
export function activateOnKey(open: () => void) {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open();
  };
}
