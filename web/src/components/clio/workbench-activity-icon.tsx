import {
  BookOpenIcon,
  BotIcon,
  FileDiffIcon,
  FileTextIcon,
  HistoryIcon,
  ListChecksIcon,
  ListTodoIcon,
  MapIcon,
  MessageCircleQuestionIcon,
  PackageIcon,
  SearchIcon,
  ShieldCheckIcon,
  TerminalSquareIcon,
  WrenchIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { GoalIcon, LoopIcon, ScheduleIcon } from '@/lib/icon-vocabulary';
import type { ActivityKind, WorkSlot } from './workbench-activity-model';

type Icon = ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;

const KIND_ICONS: Record<ActivityKind, Icon> = {
  tool: WrenchIcon,
  search: SearchIcon,
  file: FileTextIcon,
  diff: FileDiffIcon,
  subagent: BotIcon,
  process: TerminalSquareIcon,
  task: ListChecksIcon,
  question: MessageCircleQuestionIcon,
  approval: ShieldCheckIcon,
  work: ListTodoIcon,
  artifact: PackageIcon,
  source: BookOpenIcon,
  turn: HistoryIcon,
};

const WORK_ICONS: Record<WorkSlot, Icon> = {
  plan: MapIcon,
  todos: ListTodoIcon,
  goal: GoalIcon,
  loop: LoopIcon,
  schedule: ScheduleIcon,
};

/** The 16px mark of an Activity row and of its detail tab, by what the row is. */
export function ActivityKindIcon({
  kind,
  work,
  className,
}: {
  kind: ActivityKind;
  work?: WorkSlot;
  className?: string;
}) {
  const Icon = (work && WORK_ICONS[work]) ?? KIND_ICONS[kind] ?? WrenchIcon;
  return <Icon aria-hidden className={className} />;
}
