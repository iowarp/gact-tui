import type { Session } from '@clio/core/v3';
import { Settings2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type SessionBehaviorPatch = Partial<
  Pick<Session, 'mode' | 'edit_mode' | 'routing_mode' | 'approval_mode'>
>;

export interface ClioSessionBehaviorMenuProps {
  disabled?: boolean;
  session: Session;
  onChange: (patch: SessionBehaviorPatch) => Promise<void>;
}

const modeLabels: Record<Session['mode'], string> = {
  edit: 'Build and edit',
  plan: 'Plan before acting',
  architect: 'Architecture',
};

const routingLabels: Record<Session['routing_mode'], string> = {
  auto: 'Automatic',
  chat: 'Conversation only',
  experts: 'Use domain experts',
  reasoning_only: 'Reasoning only',
};

const editLabels: Record<Session['edit_mode'], string> = {
  diff: 'Reviewable changes',
  whole: 'Replace whole files',
  patch: 'Patch operations',
};

const approvalLabels: Record<Session['approval_mode'], string> = {
  ask: 'Ask me',
  'auto-edits': 'Allow workspace edits',
  'ai-review': 'AI review',
  'spotter-ai': 'SPOTTER review',
  bypass: 'Bypass checks',
};

function shortSummary(session: Session) {
  const mode = session.mode === 'edit' ? 'Build' : session.mode === 'plan' ? 'Plan' : 'Architect';
  const routing = session.routing_mode === 'auto' ? 'Auto' : routingLabels[session.routing_mode];
  return `${mode} mode, ${routing} routing`;
}

export function ClioSessionBehaviorMenu({
  disabled,
  session,
  onChange,
}: ClioSessionBehaviorMenuProps) {
  const [pending, setPending] = useState(false);
  const [confirmBypass, setConfirmBypass] = useState(false);

  const change = async (patch: SessionBehaviorPatch) => {
    setPending(true);
    try {
      await onChange(patch);
      toast.success('Session behavior updated');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update this session');
      return false;
    } finally {
      setPending(false);
    }
  };

  const unavailable = disabled || pending;
  const description = `${modeLabels[session.mode]}, ${routingLabels[session.routing_mode]}, ${editLabels[session.edit_mode]}, ${approvalLabels[session.approval_mode]}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Session behavior: ${description}`}
            className="h-7 shrink-0 gap-1.5 px-2"
            disabled={unavailable}
            size="sm"
            variant="outline"
          >
            <Settings2Icon aria-hidden="true" className="size-3.5" />
            <span className="hidden max-w-44 truncate xl:inline">{shortSummary(session)}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Working mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => void change({ mode: value as Session['mode'] })}
            value={session.mode}
          >
            {Object.entries(modeLabels).map(([value, label]) => (
              <DropdownMenuRadioItem disabled={unavailable} key={value} value={value}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>How work is routed</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) =>
              void change({ routing_mode: value as Session['routing_mode'] })
            }
            value={session.routing_mode}
          >
            {Object.entries(routingLabels).map(([value, label]) => (
              <DropdownMenuRadioItem disabled={unavailable} key={value} value={value}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>How file changes are prepared</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => void change({ edit_mode: value as Session['edit_mode'] })}
            value={session.edit_mode}
          >
            {Object.entries(editLabels).map(([value, label]) => (
              <DropdownMenuRadioItem disabled={unavailable} key={value} value={value}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Protected actions</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              if (value === 'bypass') setConfirmBypass(true);
              else void change({ approval_mode: value as Session['approval_mode'] });
            }}
            value={session.approval_mode}
          >
            {Object.entries(approvalLabels).map(([value, label]) => (
              <DropdownMenuRadioItem
                className={value === 'bypass' ? 'text-destructive' : undefined}
                disabled={unavailable}
                key={value}
                value={value}
              >
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog onOpenChange={setConfirmBypass} open={confirmBypass}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bypass protected-action checks?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent may perform supported actions without asking first. Workspace boundaries and
              unavailable capabilities still apply, but individual changes will not wait for review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep asking</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                void change({ approval_mode: 'bypass' }).then((changed) => {
                  if (changed) setConfirmBypass(false);
                });
              }}
              variant="destructive"
            >
              Bypass checks
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
