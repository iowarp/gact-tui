import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TopBarEndHost } from './top-bar-end-context';

/** Renders `children` at the end of the top bar, or in place when there is no top bar. */
export function TopBarEnd({ children }: { children: ReactNode }) {
  const host = useContext(TopBarEndHost);
  return host ? createPortal(children, host) : children;
}
