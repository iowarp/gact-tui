import {
  BotIcon,
  BracesIcon,
  DatabaseIcon,
  FileCodeIcon,
  FileDiffIcon,
  FileImageIcon,
  FileTextIcon,
  Grid3x3Icon,
  ListTreeIcon,
  MessageSquareIcon,
  PackageIcon,
  WaypointsIcon,
  WorkflowIcon,
  WrenchIcon,
} from 'lucide-react';
import { fileCategory } from '@/lib/artifact-categories';
import { HelpIcon } from '@/lib/icon-vocabulary';
import type { ComponentType, SVGProps } from 'react';

export type ReferenceIcon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * One icon per reference kind, shared by every surface that draws a reference:
 * the composer's popover, its inline tokens, and the transcript card a sent
 * reference becomes. A reader should recognise the same source in all three.
 */
const REFERENCE_KIND_ICONS: Record<string, ReferenceIcon> = {
  agent_run: BotIcon,
  artifact: PackageIcon,
  context_frame: BracesIcon,
  diff: FileDiffIcon,
  evidence_source: WaypointsIcon,
  flow: WorkflowIcon,
  plan: ListTreeIcon,
  resource: DatabaseIcon,
  server: WrenchIcon,
  session: MessageSquareIcon,
  subagent: BotIcon,
  workflow: WorkflowIcon,
  workspace_file: FileTextIcon,
};

const TABLE_EXTENSIONS = /\.(csv|tsv|xlsx?|ods|parquet|arrow|feather)$/iu;
const ARRAY_EXTENSIONS = /\.(h5|hdf5?|nc|nc4|zarr|npy|npz)$/iu;

/** A workspace file's glyph by what it holds: a table, an array store, code, an image or text. */
function fileIcon(name: string, mediaType: string): ReferenceIcon {
  if (TABLE_EXTENSIONS.test(name)) return Grid3x3Icon;
  if (ARRAY_EXTENSIONS.test(name)) return DatabaseIcon;
  const category = fileCategory(name, mediaType);
  if (category === 'scripts') return FileCodeIcon;
  if (category === 'images') return FileImageIcon;
  return FileTextIcon;
}

/**
 * The icon for a reference kind, and for a file the kind of data it holds when
 * its name is known. A kind this build does not know — a newer service's — gets
 * the question mark rather than crashing the surface that indexed the table.
 */
export function referenceKindIcon(kind: string, name?: string, mediaType = ''): ReferenceIcon {
  if (kind === 'workspace_file' && name) return fileIcon(name, mediaType);
  return REFERENCE_KIND_ICONS[kind] ?? HelpIcon;
}
