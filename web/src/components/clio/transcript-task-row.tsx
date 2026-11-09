import type { Task } from '@clio/core/v3';
import { ListChecksIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ActivityBody, ActivityDisclosure, ActivityRow } from './activity-row';
import { StatusIndicator } from './primitives/status-indicator';
import { clioStatusLabel } from './status';
import { delegateTone } from './delegate-tone';
import { useTranscriptDisclosure } from './transcript-disclosure-context';

/**
 * A task the agent tracked, as an activity row: "Task", its title, then its
 * state in the status column. Its detail, the one thing a task adds beyond
 * title and state, reads in the opened body and is reachable from the keyboard.
 */
export function TranscriptTaskRow({ task, id }: { task?: Task; id: string }) {
  const [open, setOpen] = useTranscriptDisclosure(`task:${task?.id ?? id}`);
  const title = task?.title || 'Task unavailable';
  const state = task?.state;
  const tone = state ? delegateTone(state) : 'idle';
  const label = state ? clioStatusLabel(state) : 'Unavailable';
  const outcome = tone === 'success' || tone === 'running' ? undefined : label.toLowerCase();
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
      <ActivityRow
        data-turn-activity={`task:${task?.id ?? id}`}
        open={open}
        onOpenChange={setOpen}
        disclosure={
          <ActivityDisclosure
            open={open}
            label={`${open ? 'Collapse' : 'Expand'} task ${title}`}
            asChildTrigger={(button) => <CollapsibleTrigger asChild>{button}</CollapsibleTrigger>}
          />
        }
        icon={<ListChecksIcon aria-hidden="true" />}
        name="Task"
        argument={title}
        argumentStyle="text"
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
        info={null}
      />
      <CollapsibleContent>
        <ActivityBody label={`Task ${title}`} framed={false} className="text-muted-foreground">
          {task?.detail || 'No task detail was reported.'}
        </ActivityBody>
      </CollapsibleContent>
    </Collapsible>
  );
}
