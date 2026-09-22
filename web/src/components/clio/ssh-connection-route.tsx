import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CircleIcon,
  GripVerticalIcon,
  MapPinIcon,
  PlusIcon,
  Settings2Icon,
  XIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SshHost } from '@/lib/ssh-hosts';
import { jumpRouteId, reorderJumpHosts } from './ssh-route-utils';

const ADD_DESTINATION = '__add-ssh-destination__';

/** Google-Maps-style ordered route editor for jump hosts and the final SSH destination. */
export function SshConnectionRoute({
  onChange,
  onConfigureDestination,
  onCreateDestination,
  options,
  value,
}: {
  onChange: (host: SshHost | undefined) => void;
  onConfigureDestination: () => void;
  onCreateDestination: () => void;
  options: SshHost[];
  value?: SshHost;
}) {
  const [addingJump, setAddingJump] = useState(false);
  const jumps = value?.jumpHosts ?? [];
  const jumpOptions = options.filter((option) => option.profile);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const updateJumps = (next: string[]) => {
    if (value) onChange({ ...value, jumpHosts: next });
  };
  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const reordered = reorderJumpHosts(jumps, String(active.id), String(over.id));
    if (reordered !== jumps) updateJumps(reordered);
  };

  return (
    <div aria-label="SSH connection route" className="relative grid gap-2 pl-1">
      {jumps.length || addingJump ? (
        <div aria-hidden="true" className="absolute bottom-8 left-[1.1rem] top-5 w-px bg-border" />
      ) : null}
      {jumps.length ? (
        <DndContext collisionDetection={closestCenter} onDragEnd={dragEnd} sensors={sensors}>
          <SortableContext
            items={jumps.map((_, index) => jumpRouteId(index))}
            strategy={verticalListSortingStrategy}
          >
            {jumps.map((jump, index) => (
              <JumpRouteRow
                index={index}
                jump={jump}
                key={jumpRouteId(index)}
                onChange={(next) =>
                  updateJumps(jumps.map((item, itemIndex) => (itemIndex === index ? next : item)))
                }
                onRemove={() => updateJumps(jumps.filter((_, itemIndex) => itemIndex !== index))}
                options={jumpOptions}
              />
            ))}
          </SortableContext>
        </DndContext>
      ) : null}

      {addingJump ? (
        <PendingJumpRow
          onCancel={() => setAddingJump(false)}
          onSave={(jump) => {
            updateJumps([...jumps, jump]);
            setAddingJump(false);
          }}
          options={jumpOptions}
        />
      ) : null}

      <div className="relative z-10 grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2">
        <span className="grid size-9 place-items-center rounded-full border bg-background text-primary">
          <MapPinIcon aria-hidden="true" className="size-4" />
        </span>
        <Select
          onValueChange={(id) => {
            if (id === ADD_DESTINATION) {
              onCreateDestination();
              return;
            }
            onChange(options.find((candidate) => candidate.id === id));
          }}
          value={value?.id ?? ''}
        >
          <SelectTrigger aria-label="Saved SSH host" className="min-w-0">
            <SelectValue placeholder="Choose the destination computer" />
          </SelectTrigger>
          <SelectContent>
            {options.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.label}
              </SelectItem>
            ))}
            <SelectItem value={ADD_DESTINATION}>Add another computer…</SelectItem>
          </SelectContent>
        </Select>
        <Button
          aria-label={value ? `Configure ${value.label}` : 'Add SSH host'}
          onClick={value ? onConfigureDestination : onCreateDestination}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Settings2Icon aria-hidden="true" />
        </Button>
      </div>

      <Button
        className="w-fit justify-start pl-2"
        disabled={!value || addingJump}
        onClick={() => setAddingJump(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <PlusIcon aria-hidden="true" /> Add jump host
      </Button>
    </div>
  );
}

function JumpRouteRow({
  index,
  jump,
  onChange,
  onRemove,
  options,
}: {
  index: number;
  jump: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  options: SshHost[];
}) {
  // oxlint-disable react/refs -- dnd-kit intentionally returns ref-backed drag props for rendering.
  const sortable = useSortable({ id: jumpRouteId(index) });
  return (
    <div
      className="relative z-10 grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem_2.25rem] items-center gap-2"
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
    >
      <button
        aria-label={`Drag jump host ${index + 1} to reorder`}
        className="grid size-9 cursor-grab place-items-center rounded-full border bg-background text-muted-foreground"
        type="button"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVerticalIcon aria-hidden="true" className="size-4" />
      </button>
      <JumpHostSelect onChange={onChange} options={options} value={jump} />
      <JumpHostSettings index={index} onSave={onChange} value={jump} />
      <Button
        aria-label={`Remove jump host ${index + 1}`}
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

function PendingJumpRow({
  onCancel,
  onSave,
  options,
}: {
  onCancel: () => void;
  onSave: (value: string) => void;
  options: SshHost[];
}) {
  return (
    <div className="relative z-10 grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem_2.25rem] items-center gap-2">
      <span className="grid size-9 place-items-center rounded-full border bg-background text-muted-foreground">
        <CircleIcon aria-hidden="true" className="size-3 fill-current" />
      </span>
      <JumpHostSelect onChange={onSave} options={options} value="" />
      <JumpHostSettings index={-1} onSave={onSave} value="" />
      <Button
        aria-label="Cancel adding jump host"
        onClick={onCancel}
        size="icon"
        type="button"
        variant="ghost"
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

function JumpHostSelect({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: SshHost[];
  value: string;
}) {
  const known = options.some((option) => option.profile === value);
  return (
    <Select onValueChange={onChange} value={known ? value : ''}>
      <SelectTrigger aria-label="Preconfigured jump host">
        <SelectValue placeholder={value || 'Select a saved host'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.profile ?? option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function JumpHostSettings({
  index,
  onSave,
  value,
}: {
  index: number;
  onSave: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const label = index < 0 ? 'Configure new jump host' : `Configure jump host ${index + 1}`;
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button aria-label={label} size="icon" type="button" variant="ghost">
          <Settings2Icon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            Enter an OpenSSH profile or a user@host[:port] destination.
          </p>
        </div>
        <Input
          aria-label="Jump host address"
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          placeholder="gateway.example.edu"
          value={draft}
        />
        <Button
          disabled={!draft.trim()}
          onClick={() => {
            onSave(draft.trim());
            setOpen(false);
          }}
          size="sm"
          type="button"
        >
          Use jump host
        </Button>
      </PopoverContent>
    </Popover>
  );
}
