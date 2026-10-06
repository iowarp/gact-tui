import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToolbarAction } from './viewer-toolbar';
import { FileViewerInformationHost } from './file-viewer-context';

/** Contributes format details to the common file information instead of another header. */
export function FileViewerInformation({ children, label }: { children: ReactNode; label: string }) {
  const host = useContext(FileViewerInformationHost);
  if (host !== undefined) return host ? createPortal(children, host) : null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolbarAction label={label}>
          <InfoIcon aria-hidden="true" />
        </ToolbarAction>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-1.5">
        {children}
      </PopoverContent>
    </Popover>
  );
}
