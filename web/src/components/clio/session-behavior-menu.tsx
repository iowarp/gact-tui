import type { Session } from '@clio/core/v3';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SESSION_APPROVAL_OPTIONS,
  SESSION_MODE_OPTIONS,
  SESSION_MODE_PATCHES,
  type SessionBehaviorOption,
  type SessionBehaviorPatch,
} from './session-behavior-options';

export type { SessionBehaviorPatch } from './session-behavior-options';

export interface ClioSessionBehaviorMenuProps {
  disabled?: boolean;
  session: Session;
  onChange: (patch: SessionBehaviorPatch) => Promise<void>;
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
  const selectedMode =
    SESSION_MODE_OPTIONS.find((option) => option.value === session.mode) ?? SESSION_MODE_OPTIONS[0];
  const selectedApproval =
    SESSION_APPROVAL_OPTIONS.find((option) => option.value === session.approval_mode) ??
    SESSION_APPROVAL_OPTIONS[0];
  const ModeIcon = selectedMode.icon;
  const ApprovalIcon = selectedApproval.icon;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Work mode: ${selectedMode.label}`}
            className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            disabled={unavailable}
            size="icon-sm"
            title={`Work mode: ${selectedMode.label}`}
            type="button"
            variant="ghost"
          >
            <ModeIcon aria-hidden="true" className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Work mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => void change(SESSION_MODE_PATCHES[value as Session['mode']])}
            value={session.mode}
          >
            {SESSION_MODE_OPTIONS.map((option) => (
              <BehaviorMenuItem disabled={unavailable} key={option.value} option={option} />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Confirmation policy: ${selectedApproval.label}`}
            className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            disabled={unavailable}
            size="icon-sm"
            title={`Confirmation policy: ${selectedApproval.label}`}
            type="button"
            variant="ghost"
          >
            <ApprovalIcon aria-hidden="true" className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Confirmations</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              if (value === 'bypass') setConfirmBypass(true);
              else void change({ approval_mode: value as Session['approval_mode'] });
            }}
            value={session.approval_mode}
          >
            {SESSION_APPROVAL_OPTIONS.map((option) => (
              <BehaviorMenuItem
                destructive={option.value === 'bypass'}
                disabled={unavailable}
                key={option.value}
                option={option}
              />
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

function BehaviorMenuItem<T extends string>({
  destructive,
  disabled,
  option,
}: {
  destructive?: boolean;
  disabled?: boolean;
  option: SessionBehaviorOption<T>;
}) {
  const Icon = option.icon;
  return (
    <DropdownMenuRadioItem
      className={destructive ? 'text-destructive focus:text-destructive' : undefined}
      disabled={disabled}
      value={option.value}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{option.label}</span>
        <span className="block text-xs font-normal text-muted-foreground">
          {option.description}
        </span>
      </span>
    </DropdownMenuRadioItem>
  );
}
