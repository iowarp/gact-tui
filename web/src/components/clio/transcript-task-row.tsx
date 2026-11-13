import type { Task } from '@clio/core/v3';
import { ListChecksIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { ActivityBody, ActivityDisclosure, ActivityInfoButton, ActivityRow } from './activity-row';
import { DialogFrame } from './primitives/dialog-frame';
import type { KeyValueItem } from './primitives/key-value-grid';
import { DetailsSection, TechnicalDetailsFacts } from './tool-technical-details';
import { StatusIndicator } from './primitives/status-indicator';
import { clioStatusLabel } from './status';
import { delegateTone } from './delegate-tone';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { t } from '@lingui/core/macro';
import { formatLocale } from '@/lib/locale-format';

/**
 * A task the agent tracked, as an activity row: "Task", its title, then its
 * state in the status column. Its detail, the one thing a task adds beyond
 * title and state, reads in the opened body and is reachable from the keyboard.
 */
export function TranscriptTaskRow({ task, id }: { task?: Task; id: string }) {
  const [open, setOpen] = useTranscriptDisclosure(`task:${task?.id ?? id}`);
  const title = task?.title || t`Task unavailable`;
  const state = task?.state;
  const tone = state ? delegateTone(state) : 'idle';
  const label = state ? clioStatusLabel(state) : t`Unavailable`;
  const outcome =
    tone === 'success' || tone === 'running' ? undefined : label.toLocaleLowerCase(formatLocale());
  const [details, setDetails] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
      <ActivityRow
        data-turn-activity={`task:${task?.id ?? id}`}
        open={open}
        onOpenChange={setOpen}
        disclosure={
          <ActivityDisclosure
            open={open}
            label={open ? t`Collapse task ${title}` : t`Expand task ${title}`}
            asChildTrigger={(button) => <CollapsibleTrigger asChild>{button}</CollapsibleTrigger>}
          />
        }
        icon={<ListChecksIcon aria-hidden="true" />}
        name="Task"
        argument={title}
        argumentTitle={title}
        outcome={outcome}
        outcomeTone={
          tone === 'error'
            ? 'error'
            : tone === 'warning' || tone === 'waiting'
              ? 'warning'
              : 'muted'
        }
        elapsed={null}
        status={<StatusIndicator tone={tone} label={label} display="column" mark="glyph" />}
        info={
          task ? (
            <ActivityInfoButton
              label={t`Technical details for task ${title}`}
              hint={t`View the task, its state, and what it reported`}
              onClick={() => setDetails(true)}
            />
          ) : null
        }
      />
      <CollapsibleContent>
        <ActivityBody label={t`Task ${title}`} framed={false} className="text-muted-foreground">
          {task?.detail || t`No task detail was reported.`}
        </ActivityBody>
      </CollapsibleContent>
      {details && task ? (
        <TaskDetailsDialog open={details} onOpenChange={setDetails} task={task} label={label} />
      ) : null}
    </Collapsible>
  );
}

/** ⓘ on a task: what the agent tracked, its state and the handle it was recorded under. */
function TaskDetailsDialog({
  open,
  onOpenChange,
  task,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  label: string;
}) {
  const items: KeyValueItem[] = [
    { label: t`Task`, value: task.title || t`Untitled` },
    { label: t`State`, value: label },
    { label: t`Handle`, value: task.id, mono: true },
  ];
  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      icon={<InfoIcon className="size-4" />}
      title={t`Task: Technical details`}
      description={t`The task the agent tracked, its state, and what it reported.`}
      className="w-[clamp(360px,56vw,760px)]"
    >
      <div className="grid max-h-[65dvh] min-w-0 gap-2.5 overflow-auto text-menu [overflow-wrap:anywhere]">
        <TechnicalDetailsFacts items={items} />
        {task.detail ? (
          <DetailsSection title={t`Detail`} copy={task.detail} copyLabel={t`Copy detail`}>
            <p className="whitespace-pre-wrap text-muted-foreground">{task.detail}</p>
          </DetailsSection>
        ) : null}
      </div>
    </DialogFrame>
  );
}
