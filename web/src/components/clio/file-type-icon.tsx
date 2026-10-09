import {
  ArchiveIcon,
  BoxIcon,
  FileCodeIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FilmIcon,
  ImageIcon,
  MusicIcon,
  PresentationIcon,
} from 'lucide-react';
import { fileFormatLabel } from '@/lib/media-types';
import { fileCategory } from '@/lib/artifact-categories';

/** Shared file identity for canvas tabs and explorer rows. */
export function FileTypeIcon({
  name,
  mediaType = '',
  className = 'size-3.5',
}: {
  name: string;
  mediaType?: string;
  className?: string;
}) {
  const format = fileFormatLabel(name, mediaType);
  const category = fileCategory(name, mediaType);
  const Icon =
    category === 'models'
      ? BoxIcon
      : category === 'scripts'
        ? FileCodeIcon
        : category === 'slides'
          ? PresentationIcon
          : category === 'images'
            ? ImageIcon
            : ['PowerPoint', 'Presentation'].includes(format)
              ? PresentationIcon
              : ['Excel', 'Spreadsheet', 'CSV', 'TSV'].includes(format)
                ? FileSpreadsheetIcon
                : ['Word', 'Document', 'Markdown', 'PDF', 'Text'].includes(format)
                  ? FileTextIcon
                  : ['JSON', 'YAML'].includes(format)
                    ? FileCodeIcon
                    : format === 'Video'
                      ? FilmIcon
                      : format === 'Audio'
                        ? MusicIcon
                        : format === 'ZIP'
                          ? ArchiveIcon
                          : FileIcon;
  return <Icon aria-hidden="true" className={className} />;
}
