import { ChevronDownIcon, LogInIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ProviderLoginButtonProps {
  /** "Log in", or "Log in again" for a session the provider refuses. */
  label?: string;
  onLogIn: () => void;
  /** Offered as the secondary choice behind the chevron when present. */
  onUseCode?: () => void;
  /** More ways in, behind the same chevron (e.g. setting it up in Settings). */
  menuItems?: ReactNode;
  disabled?: boolean;
  /** `xs`: the 22px split of a picker's manage row. */
  size?: 'xs' | 'sm' | 'default';
}

/**
 * The ONE Log in control: a primary button, with signing in by a one-time
 * code as a secondary choice behind its chevron (a split button), never a
 * second top-level button beside it.
 */
export function ProviderLoginButton({
  label = 'Log in',
  onLogIn,
  onUseCode,
  menuItems,
  disabled = false,
  size = 'sm',
}: ProviderLoginButtonProps) {
  const xs = size === 'xs';
  const login = (
    <Button
      className={xs ? 'h-[22px] gap-[5px] px-2 text-caption [&_svg]:size-3' : undefined}
      disabled={disabled}
      onClick={onLogIn}
      size={size}
      type="button"
    >
      <LogInIcon data-icon="inline-start" />
      {label}
    </Button>
  );
  if (!onUseCode && !menuItems) return login;
  return (
    <ButtonGroup data-slot="provider-login-button">
      {login}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="More ways to log in"
            className={cn(
              'border-s border-primary-foreground/25',
              xs && 'size-[22px] w-4 [&_svg]:size-3',
            )}
            disabled={disabled}
            size={size === 'default' ? 'icon' : size === 'sm' ? 'icon-sm' : 'icon-xs'}
            type="button"
          >
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onUseCode ? (
            <DropdownMenuItem onSelect={onUseCode}>Log in with a code instead</DropdownMenuItem>
          ) : null}
          {menuItems}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
