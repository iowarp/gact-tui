import {
  AudioLinesIcon,
  BinaryIcon,
  BoxIcon,
  BracesIcon,
  BrainIcon,
  ClapperboardIcon,
  EyeIcon,
  FileTextIcon,
  FlaskConicalIcon,
  GaugeIcon,
  GiftIcon,
  GlobeIcon,
  ImageIcon,
  LanguagesIcon,
  ListOrderedIcon,
  MessageSquareTextIcon,
  MicIcon,
  RouteIcon,
  ScanSearchIcon,
  ScrollTextIcon,
  ShapesIcon,
  SparklesIcon,
  TagsIcon,
  TypeIcon,
  VideoIcon,
  Volume2Icon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ModelCapabilityTag } from '@/lib/model-capability-tags';

/**
 * The ONE icon mapping for capability tags: the picker rows, the Models card
 * and the picker's filter panel all draw a tag with the glyph chosen here, so
 * "Vision" is the same eye everywhere. Keyed `axis:value`; a task is keyed by
 * the Hugging Face task it performs (`task:text-to-image`).
 */
const TAG_ICONS: Record<string, LucideIcon> = {
  'input_modality:text': TypeIcon,
  'input_modality:image': EyeIcon,
  'input_modality:audio': AudioLinesIcon,
  'input_modality:video': VideoIcon,
  'input_modality:pdf': FileTextIcon,
  'output_modality:text': TypeIcon,
  'output_modality:image': ImageIcon,
  'output_modality:audio': Volume2Icon,
  'output_modality:video': ClapperboardIcon,
  'output_modality:embeddings': BinaryIcon,
  'output_modality:scores': GaugeIcon,
  'capability:tool_calling': WrenchIcon,
  'capability:reasoning': BrainIcon,
  'capability:structured_output': BracesIcon,
  'task:text-generation': MessageSquareTextIcon,
  'task:text-to-image': ImageIcon,
  'task:image-to-image': ImageIcon,
  'task:text-to-video': ClapperboardIcon,
  'task:image-to-video': ClapperboardIcon,
  'task:text-to-speech': Volume2Icon,
  'task:text-to-audio': Volume2Icon,
  'task:automatic-speech-recognition': MicIcon,
  'task:feature-extraction': BinaryIcon,
  'task:sentence-similarity': BinaryIcon,
  'task:text-ranking': ListOrderedIcon,
  'task:text-classification': TagsIcon,
  'task:token-classification': TagsIcon,
  'task:translation': LanguagesIcon,
  'task:object-detection': ScanSearchIcon,
  'task:image-segmentation': ScanSearchIcon,
  'task:text-to-3d': BoxIcon,
  'task:image-to-3d': BoxIcon,
};

/** The glyph for a Hugging Face task id, or the generic task glyph. */
export function hubTaskIcon(task: string): LucideIcon {
  return TAG_ICONS[`task:${task}`] ?? ShapesIcon;
}

/** The glyph a capability tag is drawn with. */
export function tagIcon(tag: ModelCapabilityTag): LucideIcon {
  if (tag.axis === 'context') return ScrollTextIcon;
  if (tag.axis === 'price') return GiftIcon;
  if (tag.axis === 'kind') return RouteIcon;
  if (tag.axis === 'role') return FlaskConicalIcon;
  if (tag.axis === 'domain') return GlobeIcon;
  if (tag.axis === 'task') {
    const hub = tag.hubTasks?.[0];
    return hub ? hubTaskIcon(hub) : ShapesIcon;
  }
  return TAG_ICONS[`${tag.axis}:${tag.value}`] ?? SparklesIcon;
}
