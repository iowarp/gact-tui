import { BoxIcon } from 'lucide-react';
import { FileType } from '@/components/reui/file-type';
import { fileIdentityType } from '@/lib/file-presentation';
import { fileCategory } from '@/lib/artifact-categories';
import { cn } from '@/lib/utils';

/** Shared format identity; readable badges in rows and family glyphs in small controls. */
export function FileTypeIcon({
  name,
  mediaType = '',
  className = 'size-4',
  badge = false,
}: {
  name: string;
  mediaType?: string;
  className?: string;
  badge?: boolean;
}) {
  if (fileCategory(name, mediaType) === 'models')
    return (
      <BoxIcon
        aria-hidden="true"
        className={cn('text-indigo-600 dark:text-indigo-400', className)}
      />
    );
  const type = fileIdentityType(name, mediaType);
  return (
    <FileType
      aria-hidden="true"
      type={type}
      glyph={!badge}
      variant="light"
      className={cn('shrink-0', className)}
    />
  );
}
