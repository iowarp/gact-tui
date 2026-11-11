import { useRef, useState } from 'react';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useClioMenuConnections } from '@/hooks/use-clio-menu-connections';
import { useClioMenuRequest } from '@/lib/clio-menu-request';
import { useLiveLocation } from '@/lib/live-location';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioMenuContent } from './clio-menu';

/**
 * The CLIO menu on a page without the left bar (Infrastructure, the Settings
 * window): Alt Space, or a request such as the native Switch agent, opens it
 * from an unseen anchor at the frame's top-left. Below 600px it is the bottom sheet.
 * Place the anchor with `className` inside a positioned frame.
 */
export function FrameClioMenu({
  className,
  covered,
}: {
  className?: string;
  /** Another frame's menu takes the key while this one is covered. */
  covered?: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  // The saved agents load on first use, not with the page.
  const [used, setUsed] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const uncovered = () => !covered?.();
  const show = () => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setUsed(true);
    setOpen(true);
  };
  useShortcut('app-menu', show, { enabled: !inTauri(), when: uncovered });
  useClioMenuRequest(show, uncovered);

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className={cn('pointer-events-none absolute size-0', className)}
          tabIndex={-1}
        />
      </DropdownMenuTrigger>
      {used ? (
        <FrameClioMenuContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus.current;
            returnFocus.current = null;
            if (target?.isConnected) target.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </DropdownMenu>
  );
}

function FrameClioMenuContent({ onCloseAutoFocus }: { onCloseAutoFocus: (event: Event) => void }) {
  const { settings: connection } = useConnectionSettings();
  const { settings, connections, connectionAvailabilities, onConnect } = useClioMenuConnections(
    connection.endpoint,
  );
  const location = useLiveLocation();
  return (
    <ClioMenuContent
      activeLabel={settings.label}
      activeLocation={settings.location}
      connectionAvailabilities={connectionAvailabilities}
      connections={connections}
      currentPath={location.pathname}
      endpoint={settings.endpoint}
      onCloseAutoFocus={onCloseAutoFocus}
      onConnect={onConnect}
    />
  );
}
