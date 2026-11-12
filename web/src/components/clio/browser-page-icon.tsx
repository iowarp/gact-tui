import { useState } from 'react';
import { GlobeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrowserPages } from './use-browser-pages';

/**
 * A browser page's own icon (its favicon, which the server reads through the
 * page's profile), so pages are told apart even as icon-only tabs. A page
 * without one, a new page, or an icon that fails to draw shows the globe.
 */
export function BrowserPageIcon({
  sessionId,
  pageId,
  className,
}: {
  sessionId: string;
  pageId?: string;
  className?: string;
}) {
  const pages = useBrowserPages(pageId ? sessionId : '');
  const favicon = pageId ? (pages.data?.find((page) => page.id === pageId)?.favicon ?? '') : '';
  const [failed, setFailed] = useState('');
  if (!favicon || failed === favicon)
    return <GlobeIcon aria-hidden="true" className={cn('size-3.5', className)} />;
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn('size-3.5 shrink-0 rounded-[2px] object-contain', className)}
      data-slot="browser-page-favicon"
      draggable={false}
      onError={() => setFailed(favicon)}
      src={favicon}
    />
  );
}
