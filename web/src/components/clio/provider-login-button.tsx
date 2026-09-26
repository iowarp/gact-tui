import { ChevronDownIcon, LogInIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
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
  disabled?: boolean;
  size?: 'sm' | 'default';
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
  disabled = false,
  size = 'sm',
}: ProviderLoginButtonProps) {
  const login = (
    <Button disabled={disabled} onClick={onLogIn} size={size} type="button">
      <LogInIcon data-icon="inline-start" />
      {label}
    </Button>
  );
  if (!onUseCode) return login;
  return (
    <ButtonGroup data-slot="provider-login-button">
      {login}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="More ways to log in"
            className="border-s border-primary-foreground/25"
            disabled={disabled}
            size={size === 'sm' ? 'icon-sm' : 'icon'}
            type="button"
          >
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onUseCode}>Log in with a code instead</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
