import { getFileType, getFileTypeColor } from '@/components/reui/file-type';
import { cn } from './utils';

/** Use the original filename, with MIME fallback for extensionless files. */
export function fileIdentityType(name: string, mediaType = ''): string {
  const named = getFileType(name);
  return named === 'empty' ? getFileType(mediaType) : named;
}

/** Match the vendored format color without a second table, keeping tint quiet. */
export function fileRowTint(name: string, mediaType = ''): string {
  return cn(
    getFileTypeColor(fileIdentityType(name, mediaType)),
    'bg-[color:color-mix(in_oklab,currentColor_3%,var(--card))]',
  );
}
