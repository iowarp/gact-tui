import { createContext, useContext } from 'react';
import { useLocation, type Location } from 'react-router-dom';

export const LiveLocationContext = createContext<Location | null>(null);

/** The address bar's location, including the open Settings section. */
export function useLiveLocation(): Location {
  const live = useContext(LiveLocationContext);
  const routed = useLocation();
  return live ?? routed;
}
