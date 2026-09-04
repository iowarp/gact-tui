import {
  BotIcon,
  BracesIcon,
  CircleHelpIcon,
  DatabaseIcon,
  FileDiffIcon,
  FileTextIcon,
  ListTreeIcon,
  MessageSquareIcon,
  PackageIcon,
  WaypointsIcon,
} from 'lucide-react';
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
  plan: ListTreeIcon,
  resource: DatabaseIcon,
  session: MessageSquareIcon,
  workspace_file: FileTextIcon,
};

/**
 * The icon for a reference kind. A kind this build does not know — a newer
 * service's — gets the question mark rather than crashing the surface that
 * indexed the table.
 */
export function referenceKindIcon(kind: string): ReferenceIcon {
  return REFERENCE_KIND_ICONS[kind] ?? CircleHelpIcon;
}
