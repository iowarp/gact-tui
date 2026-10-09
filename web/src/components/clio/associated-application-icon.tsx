import { useState } from 'react';
import { ExternalLinkIcon } from 'lucide-react';
import type { DocumentApplication } from '@/tauri/documents';

/** Show the installed application's native icon, with a stable fallback for unavailable icons. */
export function AssociatedApplicationIcon({ application }: { application: DocumentApplication }) {
  const [failedIcon, setFailedIcon] = useState<string>();
  const icon = application.icon_data_url;
  if (
    !icon ||
    icon === failedIcon ||
    icon.length > 2_800_000 ||
    !icon.startsWith('data:image/png;base64,')
  ) {
    return <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0" />;
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      src={icon}
      width={16}
      height={16}
      className="size-4 shrink-0 object-contain"
      onError={() => setFailedIcon(icon)}
    />
  );
}
